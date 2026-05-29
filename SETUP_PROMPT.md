Tu vas installer et lancer le projet Holter PMS Intelligence sur cette machine. Fais tout dans l'ordre sans t'arrêter sauf erreur bloquante.

**1. Cloner le projet**
Clone la branche `feature/holter-pms-v1` du repo `https://github.com/Corindpz/Holter.git` dans un dossier `Holter/` puis place-toi dedans.

**2. Installer les dépendances Python**
Le projet tourne sur Python 3.13. Crée un venv `.venv` à la racine et installe les dépendances :
- macOS : `brew install pkgconf` puis `pip install -r requirements.txt`
- Windows : `pip install -r requirements.txt` directement

**3. Vérifier Ollama**
Ollama est déjà installé sur cette machine. Vérifie qu'il tourne (`ollama list`). La config par défaut utilise `qwen2.5:14b` (optimisé pour VM 64 Go) — pull-le s'il n'est pas présent :
```
ollama pull qwen2.5:14b
```

**4. Lancer l'application**
Depuis la racine du projet, utilise le script de démarrage optimisé :
```
chmod +x start.sh && ./start.sh
```
Ce script démarre Ollama avec `OLLAMA_NUM_PARALLEL=3` (3 analyses en parallèle côté Ollama) puis lance Holter. L'interface s'ouvre automatiquement sur http://localhost:8765.

Sur une VM 64 Go, cette config donne environ 20-25 tickets/min (~1h15 pour une semaine normale de 1700 tickets).

Le front est déjà compilé dans `src/api/static/` — pas besoin de Node.js ni de `npm install`.

**5. Vérifier**
- L'interface charge correctement (sidebar avec 6 onglets visible)
- Aucune bannière d'erreur amber (elle apparaît uniquement si Ollama n'est pas lancé)
- L'onglet "Tableau de bord" est accessible

Si tu rencontres une erreur à n'importe quelle étape, dis-le moi.
