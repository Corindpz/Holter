# HOLTER PMS — Design Document
**Date :** 2026-05-26
**Version :** 1.0
**Statut :** Approuvé pour implémentation

---

## Contexte

HOLTER PMS est un outil d'analyse Post-Market Surveillance (PMS) hebdomadaire pour les équipes QARA travaillant sur des logiciels SaMD/SIH. Il remplace le prototype VIGIL PMS (fichier HTML statique) par une application standalone locale, entièrement conforme HDS, sans dépendance à une API externe.

**Problèmes résolus :**
1. Analyse manuelle de ~1 700 tickets par semaine — trop chronophage
2. Qualification RAQA (MDR Art.87, CAPA) longue et non uniformisée
3. Traçabilité insuffisante — décisions non documentées de façon auditée
4. Rotation hebdomadaire des experts — perte de contexte d'une semaine à l'autre

**Cadre réglementaire :** MDR 2017/745 Art.87, ISO 13485 §8.2.2 et §8.5.1, ISO 14971, CEI 62304, RNI/INS, guides ANSM.

---

## Utilisateurs

- **Expert QARA de la semaine** (rotation hebdomadaire) : importe le CSV, valide les ~40 tickets flaggés, exporte le rapport PDF
- **IT/administrateur** (une seule fois) : installe Ollama, configure le modèle et le fichier `settings.json`

---

## Architecture générale

```
CSV Salesforce
      │
      ▼
┌──────────────────────────────────────────────────────┐
│  holter.exe  (Python + FastAPI, localhost:8765)       │
│                                                      │
│  1. IMPORT        → Lecture CSV, normalisation       │
│  2. ANONYMISATION → Masquage IPP/NDA/noms            │
│  3. ANALYSE IA    → Ollama local (batch, 3 passes)   │
│     ↑ enrichi par                                    │
│  6. DICTIONNAIRE  → Règles, mots-clés, corrections   │
│                                                      │
│  4. REVUE EXPERT  → UI navigateur (localhost)        │
│     └─ corrections → alimentent le Dictionnaire      │
│  5. EXPORT        → Rapport PDF auditable            │
│                                                      │
│  holter.db (SQLite) ── tendances + dictionnaire      │
└──────────────────────────────────────────────────────┘
```

**Stack technique :**
- Python 3.11+ packagé en `.exe` via PyInstaller
- FastAPI pour le serveur local
- SQLite (`holter.db`) pour la persistance
- Ollama pour l'inférence LLM locale
- ChromaDB pour le RAG réglementaire
- WeasyPrint pour la génération PDF (HTML → PDF, cohérent avec l'UI)
- HTML/JS vanilla pour l'UI (servi par FastAPI)

**Distribution :** `holter.exe` + `settings.json` + `mapping.json` déposés sur SharePoint pour téléchargement. Le fichier `holter.db` est créé localement au premier lancement — il est unique par installation et ne se partage pas (SQLite, accès mono-utilisateur). Les tendances multi-semaines sont donc propres à chaque installation ; si l'équipe souhaite une base partagée, cela fera l'objet d'une v2.

---

## Module 1 — IMPORT

### Responsabilité
Ingestion du CSV Salesforce hebdomadaire, normalisation, déduplication.

### Comportement
- Drag & drop ou sélection fichier dans l'UI
- Détection automatique d'encodage (UTF-8, Latin-1)
- Mapping colonnes Salesforce → champs internes via `mapping.json` (configurable sans toucher au code)
- Déduplication par rapport à la semaine N-1 en base
- Résumé affiché : X tickets importés, Y doublons ignorés, Z colonnes manquantes

### Champs internes normalisés
`id`, `objet`, `priorite`, `statut`, `produit`, `site`, `description`, `date_creation`, `semaine`

### Fichier de configuration
```json
// mapping.json
{
  "id": "Case Number",
  "objet": "Subject",
  "priorite": "Priority",
  "statut": "Status",
  "produit": "Product__c",
  "site": "Account Name",
  "description": "Description",
  "date_creation": "Created Date"
}
```

---

## Module 2 — ANONYMISATION

### Responsabilité
Masquer les identifiants patients dans les champs texte avant tout envoi à Ollama.

### Comportement
- Parcourt les champs `objet` et `description`
- Masque via regex + liste noire configurable :
  - IPP (format numérique long)
  - NDA (numéro de dossier d'admission)
  - Noms propres (heuristique : majuscule isolée + liste noire)
  - Dates de naissance
  - Numéros de séjour
- Remplacement par tokens neutres : `[PATIENT_ID]`, `[NOM]`, `[DATE_NAISSANCE]`, `[NDA]`

### Stockage
| Champ | Base SQLite | Envoyé à Ollama |
|---|---|---|
| Données originales | ✅ | ❌ |
| Données anonymisées | ✅ | ✅ |

L'expert voit toujours les données originales dans l'UI. Ollama ne voit que la version anonymisée.

---

## Module 3 — ANALYSE IA

### Responsabilité
Analyser les 1 700 tickets en batch, produire une décision structurée et justifiée pour chaque ticket.

### Modèle adaptatif
Détection automatique de la RAM disponible au démarrage :

| RAM disponible | Modèle | Durée estimée |
|---|---|---|
| 8 GB | `mistral:7b-instruct-q4` | ~3h |
| 16 GB | `qwen2.5:14b-instruct-q4` | ~1h30 |
| 32 GB | `qwen2.5:32b-instruct-q4` | ~45 min |
| 64 GB+ | `qwen2.5:72b-instruct-q4` | ~1h30 |

Surchargeable manuellement dans `settings.json`. L'analyse tourne en arrière-plan — l'expert peut lancer l'import en fin de journée et trouver les résultats le lendemain matin.

### Pipeline à 3 passes

**Passe 1 — Triage (tous les tickets)**
- Traitement séquentiel, 1 ticket à la fois
- Prompt court : contexte réglementaire + dictionnaire + ticket anonymisé
- Sortie : `decision`, `signal`, `confiance`
- Tickets avec `confiance ≥ 0.85` et `decision = CLOS` → archivés directement

**Passe 2 — Analyse approfondie (tickets ambigus ou flaggés)**
- Tickets `ANALYSE_REQUISE`, `SURVEILLER`, ou `confiance < 0.85`
- Chain-of-thought obligatoire : le modèle énumère indices, réglements applicables, contradictions avant de conclure
- RAG : injection des 3 passages réglementaires les plus pertinents (ChromaDB)
- Sortie complète : `decision`, `signal`, `niveau`, `confiance`, `raisonnement`, `articles_cites`, `capa_suggere`, `mots_cles`

**Passe 3 — Auto-critique (cas très ambigus)**
- Tickets avec `confiance < 0.70` après passe 2
- Second prompt : le modèle relit sa propre analyse et la challenge
- Technique de réduction des faux négatifs sur signaux MV/IV
- Si toujours `confiance < 0.70` → flaggé "Revue expert prioritaire"

### Format de sortie JSON (garanti par Ollama `format: json`)
Le champ `confiance` est auto-déclaré par le modèle dans son raisonnement — c'est une estimation subjective, pas un logprob statistique. Il sert de signal de routage (passe 1 → 2 → 3) et non de probabilité calibrée.
```json
{
  "decision": "ANALYSE_REQUISE | SURVEILLER | CLOS",
  "signal": "MV | IV | SECU | null",
  "niveau": "CRITIQUE | MAJEUR | MINEUR | null",
  "confiance": 0.91,
  "raisonnement": "...",
  "articles_cites": ["MDR Art.87 §1b", "ISO 13485 §8.2.2"],
  "capa_suggere": true,
  "mots_cles": ["surdosage", "VIDAL", "prescription"]
}
```

### RAG réglementaire
- Index vectoriel ChromaDB local (~500 MB, CPU-friendly)
- Corpus : MDR 2017/745, ISO 13485, ISO 14971, CEI 62304, RNI/INS, guides ANSM
- **Prérequis :** l'équipe QARA doit fournir les PDF des normes (certaines sont payantes — ISO 13485, ISO 14971). Un corpus minimal public (MDR, RNI/INS) est inclus dans la distribution.
- Mise à jour manuelle possible (dépôt de nouveaux PDF dans `/regulatory`, ré-indexation au prochain lancement)
- Utilisé uniquement en passe 2 et 3

---

## Module 4 — REVUE EXPERT

### Responsabilité
Interface de validation humaine, uniquement sur les tickets `ANALYSE_REQUISE` (~40/semaine).

### Identification de la rotation
À chaque ouverture, HOLTER affiche le nom de l'expert de la semaine précédente et demande l'identification de l'expert entrant. Cette information est enregistrée dans chaque décision pour la traçabilité nominative.

### Répartition des 1 700 tickets
| Décision IA | Volume estimé | Action humaine |
|---|---|---|
| CLOS (confiance ≥ 0.85) | ~1 630 | Aucune — documenté automatiquement |
| SURVEILLER | ~36 | Lecture optionnelle — inclus dans le rapport comme "sous surveillance" sans action obligatoire |
| ANALYSE_REQUISE | ~40 | **Revue humaine obligatoire** |

### Actions de l'expert sur chaque ticket ANALYSE_REQUISE
- **Confirmer** : valide la décision IA telle quelle
- **Reclasser** : modifie la décision, commentaire obligatoire
- **Écarter** : rejette le signal, justification obligatoire
- **Alimenter le dictionnaire** : propose un nouveau pattern à partir du ticket

### Règle de complétude
L'export PDF est verrouillé tant que tous les tickets `ANALYSE_REQUISE` n'ont pas reçu une décision humaine.

### Navigation de l'UI
- Tableau de bord : KPIs semaine, répartition, évolution vs N-1
- File de revue : tickets ANALYSE_REQUISE triés par criticité
- Signaux vigilance : MV/IV/SECU confirmés, fiches MDR pré-remplies
- Tendances MDR : historique multi-semaines par produit et signal
- Dictionnaire : consultation et édition des règles

---

## Module 5 — EXPORT PDF AUDITABLE

### Responsabilité
Générer la preuve documentaire de la revue PMS hebdomadaire, opposable en audit ISO 13485 / ANSM.

### Structure du rapport
```
HOLTER PMS — Rapport de revue hebdomadaire
Semaine N · [dates] · Expert : [nom] · Généré le [horodatage]

1. SYNTHÈSE EXÉCUTIVE
   KPIs, signaux détectés, décisions prises

2. TRAÇABILITÉ COMPLÈTE (1 700 tickets)
   Pour chaque ticket :
   ID · Priorité · Produit · Site · Statut
   Décision IA + confiance
   Décision expert (si ANALYSE_REQUISE) + commentaire
   Justification + articles cités
   Horodatage et signature de la décision

3. SIGNAUX VIGILANCE CONFIRMÉS
   Fiches MV/IV/SECU avec analyse MDR Art.87

4. TENDANCES MULTI-SEMAINES
   Produits récurrents, évolution des signaux

5. ANNEXE MÉTHODOLOGIQUE
   Modèle IA utilisé, version dictionnaire,
   seuils de confiance appliqués, date d'analyse
```

### Mention pour les tickets CLOS
Les 1 630 tickets CLOS apparaissent avec la mention : *"Analysé par IA — décision automatique documentée — confiance [X]% — aucune action requise"*. Cette mention, associée à la description méthodologique en annexe, constitue une preuve de processus recevable en audit ISO 13485.

---

## Module 6 — DICTIONNAIRE

### Responsabilité
Base de connaissance réglementaire vivante, enrichie par les corrections d'experts semaine après semaine.

### Structure d'une entrée
```json
{
  "pattern": "VIDAL KO",
  "signal": "MV",
  "niveau": "CRITIQUE",
  "article": "MDR Art.87 §1b",
  "cree_par": "Jean Martin",
  "date_creation": "2026-05-26",
  "semaines_validees": 12,
  "poids": "fort"
}
```

### Cycle de vie d'une entrée
| Étape | Condition | Poids dans le prompt |
|---|---|---|
| Créée | Expert propose un pattern | `faible` |
| Confirmée | 3 semaines sans contradiction | `moyen` — injecté en passe 1 |
| Établie | 10 semaines validées | `fort` — prioritaire sur le raisonnement IA |

### Boucle d'amélioration continue
```
Analyse IA → Expert corrige/valide → Dictionnaire s'enrichit
                                            ↓
                               Semaine suivante : meilleure classification
```

---

## Conformité réglementaire

| Exigence | Comment HOLTER y répond |
|---|---|
| ISO 13485 §8.2.2 — Revue systématique | Chaque ticket reçoit une décision documentée et traçable |
| ISO 13485 §8.5.1 — Amélioration continue | Dictionnaire vivant + tendances multi-semaines |
| MDR Art.87 — Déclaration incidents graves | Signaux MV détectés, fiches pré-remplies, délais affichés |
| MDR Annexe I §17 — Cybersécurité | Signaux SECU détectés et qualifiés |
| HDS — Données de santé | Tout traitement local, aucune donnée ne quitte le poste |
| RGPD — Données patient | Anonymisation avant inférence IA, données originales en base locale uniquement |

---

## Hors périmètre (v1)

- Connexion API Salesforce directe (prévu v2)
- Génération de fiches ANSM complètes prêtes à soumettre
- Multi-utilisateurs simultanés
- Interface web hébergée
