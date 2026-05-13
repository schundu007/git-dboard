# IsaacLab DevOps Dashboard

A full-stack DevOps platform for monitoring, automating, and improving the CI/CD pipeline of [isaac-sim/IsaacLab](https://github.com/isaac-sim/IsaacLab).

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Backend | FastAPI + Python 3.11 |
| Data | GitHub REST API (PAT-based) + SQLite (logs) |
| Infra | Docker + optional SLURM/PBS cluster integration |

## Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Overview: live CI status, gate summary, DORA metrics |
| **PR Hub** | PR list, gate evaluation, automation controls, runner analysis |
| **Builds** | Workflow runs, job details, artifacts, failure summaries |
| **Nightly Monitor** | Nightly matrix heatmap, trend charts, job logs |
| **Registry Manager** | ECR image list, auth, tag deletion, push status |
| **Image Tags** | Tag matrix, lifecycle policy view, tag computation |
| **Infra & Runners** | GitHub runner status, SLURM/PBS queue, runner best practices |
| **Health Analysis** | DORA metrics, CI triage (failure categories), pipeline perf, runner health |
| **Improvement Plan** | Prioritised CI/CD improvement items + GitHub issue analysis |
| **Log Monitor** | Structured log search and ingestion |
| **Analytics** | User metrics, contribution activity |
| **Insights** | Commit activity, code frequency, forks, pulse |
| **Issues** | Issue list with label/milestone filters |
| **Branches** | Branch monitor |

## Features

- **PR gate evaluation** — classifies PRs by changed files (docs/tests/source/ci) and evaluates required check categories
- **PR automation** — auto-label, auto-comment gate status, auto-trigger CI, auto-merge on gate pass
- **Runner recommendations** — maps PR type to optimal runner (ubuntu-latest vs A100-80GB GPU)
- **CI/CD improvement plan** — 17 prioritised items derived from analysis of 150 open issues and 100 open PRs, segregated into infrastructure vs product scope, with active PR tracking
- **GitHub issue analysis** — breaks down open issues into infrastructure / product bugs / features with severity ratings
- **Nightly matrix heatmap** — 14-day pass/fail grid across Isaac Sim versions and extensions
- **DORA metrics** — deployment frequency, lead time, change failure rate, MTTR
- **WebSocket log streaming** — live build log tailing

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- GitHub Personal Access Token with `repo` and `workflow` scopes

### Setup

```bash
# Clone
git clone https://github.com/schundu007/git-dboard.git
cd git-dboard

# Backend
cp .env.example .env
# Edit .env — set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev        # runs on http://localhost:5173
```

### Environment variables

```
GITHUB_TOKEN=ghp_...          # GitHub PAT
GITHUB_OWNER=isaac-sim         # repo owner
GITHUB_REPO=IsaacLab           # repo name
AWS_REGION=us-east-1           # optional: for ECR registry features
AWS_ACCESS_KEY_ID=...          # optional: for ECR
AWS_SECRET_ACCESS_KEY=...      # optional: for ECR
CLUSTER_HOST=...               # optional: for SLURM/PBS cluster features
CLUSTER_USER=...               # optional
```

See `.env.example` for the full list.

## Project Structure

```
git-dboard/
├── backend/
│   ├── main.py                # FastAPI app, lifespan, CORS
│   ├── routers/               # 14 API routers (prs, builds, nightly, ...)
│   ├── services/              # GitHub client, ECR, cluster SSH, log store
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/             # 15 page components
│   │   ├── components/        # Sidebar, Layout, UI primitives
│   │   └── lib/api.ts         # Typed API client
│   └── package.json
├── docker/scripts/            # nightly-tags.sh, resolve-matrix.py
├── services/pr-handler/       # Standalone GitHub App webhook handler (TypeScript)
└── start.sh                   # Start both backend and frontend
```

## API

The backend exposes a Swagger UI at `http://localhost:8000/docs`.

Key endpoint groups:

| Prefix | Description |
|--------|-------------|
| `/prs` | PR list, gate, files, reviews, automation |
| `/builds` | Workflow runs, jobs, artifacts, caches, deployments |
| `/nightly` | Nightly runs, matrix, trend, image matrix |
| `/improvement` | Improvement plan, issues analysis, quick wins |
| `/automation` | PR automation state, config, runner recommendations |
| `/health-analysis` | DORA, CI triage, pipeline perf, runner health |
| `/infra` | Runners, cluster queue, cluster nodes |
| `/registry` | ECR images, auth, lifecycle |
| `/logs` | Log search, ingestion, purge |

## License

MIT
