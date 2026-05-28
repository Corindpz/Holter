Bonjour. Tu vas m'aider à installer et lancer le projet Holter PMS Intelligence sur cette machine.

Voici ce que tu dois faire, dans l'ordre :

**1. Cloner le projet**
Clone la branche `feature/holter-pms-v1` du repo https://github.com/Corindpz/Holter.git dans un dossier `Holter/` sur le bureau ou dans le home directory.

**2. Installer les dépendances Python**
Le projet utilise Python 3.13. Si la machine tourne sur macOS :
- Installe `pkgconf` via brew avant pip (`brew install pkgconf`) — requis pour xhtml2pdf
- Crée un venv `.venv` à la racine du projet
- Installe les dépendances : `pip install -r requirements.txt`

Sur Windows, installe directement les dépendances sans cette étape préalable.

**3. Installer Ollama et le modèle**
- Vérifie si Ollama est déjà installé (`ollama --version`)
- Si non, installe-le (macOS : `brew install ollama`, Windows : télécharger sur https://ollama.com/download)
- Lance le service Ollama en arrière-plan
- Pull le modèle adapté à la RAM disponible :
  - RAM ≥ 60 Go → `ollama pull qwen2.5:72b`
  - RAM ≥ 28 Go → `ollama pull qwen2.5:32b`
  - RAM ≥ 12 Go → `ollama pull qwen2.5:14b`
  - RAM < 12 Go  → `ollama pull mistral`

**4. Lancer l'application**
Depuis la racine du projet :
```
python holter.py
```
L'interface s'ouvre automatiquement dans le navigateur sur http://localhost:8765.

**5. Vérifier que tout fonctionne**
- L'interface charge correctement
- Aucune bannière d'erreur rouge (si Ollama n'est pas lancé, une bannière amber s'affiche — c'est normal, assure-toi qu'Ollama tourne)
- L'onglet "Tableau de bord" est accessible

Si tu rencontres une erreur à n'importe quelle étape, dis-le moi et on la résout.
