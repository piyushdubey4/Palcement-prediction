#!/usr/bin/env bash
# One-command start for macOS/Linux: installs deps on first run, trains if needed, seeds, starts both servers.
set -e
cd "$(dirname "$0")"
( cd backend
  [ -d .venv ] || python3 -m venv .venv
  . .venv/bin/activate
  pip install -q -r requirements.txt
  [ -f app/ml/artifacts/placement_model.pkl ] || python -m app.ml.train
  python -m app.seed --demo
  uvicorn app.main:app --port 8000 & )
( cd frontend && [ -d node_modules ] || npm install ) && cd frontend && npm run dev
