Tu vas installer et lancer le projet Holter PMS Intelligence sur cette machine. Fais tout dans l'ordre sans t'arrêter sauf erreur bloquante.

**1. Cloner le projet**
Clone la branche `feature/holter-pms-v1` du repo `https://github.com/Corindpz/Holter.git` dans un dossier `Holter/` puis place-toi dedans.

**2. Installer les dépendances Python**
Le projet tourne sur Python 3.13. Crée un venv `.venv` à la racine et installe les dépendances :
- macOS : `brew install pkgconf` puis `pip install -r requirements.txt`
- Windows : `pip install -r requirements.txt` directement

**3. Vérifier Ollama**
Ollama est déjà installé sur cette machine. Vérifie qu'il tourne (`ollama list`). Si le modèle voulu n'est pas présent, pull celui qui correspond à la RAM disponible :
- RAM ≥ 60 Go → `ollama pull qwen2.5:72b`
- RAM ≥ 28 Go → `ollama pull qwen2.5:32b`
- RAM ≥ 12 Go → `ollama pull qwen2.5:14b`
- RAM < 12 Go  → `ollama pull mistral`

Holter détecte automatiquement la RAM et choisit le meilleur modèle disponible — rien à configurer.

**4. Lancer l'application**
Depuis la racine du projet :
```
python holter.py
```
L'interface s'ouvre automatiquement dans le navigateur sur http://localhost:8765.

Le front est déjà compilé dans `src/api/static/` — pas besoin de Node.js ni de `npm install`.

**5. Vérifier**
- L'interface charge correctement (sidebar avec 6 onglets visible)
- Aucune bannière d'erreur amber (elle apparaît uniquement si Ollama n'est pas lancé)
- L'onglet "Tableau de bord" est accessible

Si tu rencontres une erreur à n'importe quelle étape, dis-le moi.
