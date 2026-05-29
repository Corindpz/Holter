#!/bin/bash
# Démarrage Holter PMS Intelligence — VM 64 GB (qwen2.5:14b, 3 threads parallèles)
# Usage : ./start.sh

set -e

# Ollama avec parallélisme natif
export OLLAMA_NUM_PARALLEL=3
export OLLAMA_HOST=0.0.0.0  # accessible depuis le réseau local si besoin

# Pull du modèle si pas encore téléchargé
if ! ollama list | grep -q "qwen2.5:14b"; then
    echo "[Holter] Téléchargement qwen2.5:14b (~9 GB)..."
    ollama pull qwen2.5:14b
fi

# Démarrer Ollama en arrière-plan si pas déjà actif
if ! pgrep -x ollama > /dev/null; then
    echo "[Holter] Démarrage Ollama..."
    ollama serve &
    sleep 3
fi

# Activer le venv si présent
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
fi

echo "[Holter] Démarrage de l'application..."
python holter.py
