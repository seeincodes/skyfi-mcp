#!/usr/bin/env bash
# One-command setup and run for the SkyFi demo agent
# Usage: ./run.sh [adk|langchain]

set -euo pipefail

VARIANT="${1:-adk}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check for .env
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "No .env file found. Copying from .env.example..."
  cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
  echo "Please edit $SCRIPT_DIR/.env with your API keys, then re-run."
  exit 1
fi

# Create venv if needed
if [ ! -d "$SCRIPT_DIR/.venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "$SCRIPT_DIR/.venv"
fi

# Activate and install
source "$SCRIPT_DIR/.venv/bin/activate"
pip install -q -r "$SCRIPT_DIR/requirements.txt"

# Run
case "$VARIANT" in
  adk)
    echo "Starting SkyFi Demo Agent (Google ADK)..."
    python "$SCRIPT_DIR/agent_adk.py"
    ;;
  langchain)
    echo "Starting SkyFi Demo Agent (LangChain)..."
    python "$SCRIPT_DIR/agent_langchain.py"
    ;;
  *)
    echo "Usage: ./run.sh [adk|langchain]"
    exit 1
    ;;
esac
