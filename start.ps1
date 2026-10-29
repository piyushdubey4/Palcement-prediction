# One-command start for Windows PowerShell.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\backend
if (-not (Test-Path .venv)) { python -m venv .venv }
.\.venv\Scripts\python -m pip install -q -r requirements.txt
if (-not (Test-Path app\ml\artifacts\placement_model.pkl)) { .\.venv\Scripts\python -m app.ml.train }
.\.venv\Scripts\python -m app.seed --demo
Start-Process -NoNewWindow .\.venv\Scripts\python -ArgumentList "-m","uvicorn","app.main:app","--port","8000"
Set-Location $PSScriptRoot\frontend
if (-not (Test-Path node_modules)) { npm install }
npm run dev
