#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Backend ──────────────────────────────────────────────────────────────────
if [ ! -f "$ROOT/backend/.env" ]; then
  echo "⚠  No .env found in backend/ — copying .env.example"
  cp "$ROOT/.env.example" "$ROOT/backend/.env"
  echo "   Edit backend/.env and fill in GH_PAT before continuing."
  exit 1
fi

if [ ! -d "$ROOT/backend/.venv" ]; then
  echo "→ Creating Python venv…"
  python3 -m venv "$ROOT/backend/.venv"
fi

echo "→ Installing backend dependencies…"
"$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"

echo "→ Starting FastAPI backend on :8000…"
cd "$ROOT/backend"
"$ROOT/backend/.venv/bin/uvicorn" main:app --reload --port 8000 &
BACKEND_PID=$!

# ── Frontend ─────────────────────────────────────────────────────────────────
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "→ Installing frontend dependencies…"
  cd "$ROOT/frontend"
  npm install
fi

echo "→ Starting Vite dev server on :5173…"
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✓ Dashboard running at http://localhost:5173"
echo "✓ API running at      http://localhost:8000"
echo "  API docs:           http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM

wait
