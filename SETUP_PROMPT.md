Bonjour. Tu vas m'aider à installer et lancer le projet Holter PMS Intelligence sur cette machine.

Voici ce que tu dois faire, dans l'ordre :

**1. Cloner le projet**
Clone la branche `feature/holter-pms-v1` du repo https://github.com/Corindpz/Holter.git dans un dossier `Holter/`.

**2. Installer les dépendances Python**
Le projet utilise Python 3.13. Crée un venv `.venv` à la racine du projet et installe les dépendances :
- Sur macOS : installe d'abord `pkgconf` via brew (`brew install pkgconf`), puis `pip install -r requirements.txt`
- Sur Windows : `pip install -r requirements.txt` directement

**3. Vérifier Ollama**
Ollama est déjà installé sur cette machine. Vérifie juste qu'il tourne (`ollama list`) et que le modèle voulu est disponible. Si besoin, pull le modèle adapté à la RAM disponible :
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

**5. Vérifier**
- L'interface charge correctement
- Aucune bannière d'erreur (si Ollama n'est pas lancé une bannière amber s'affiche)
- L'onglet "Tableau de bord" est accessible

Si tu rencontres une erreur à n'importe quelle étape, dis-le moi.
