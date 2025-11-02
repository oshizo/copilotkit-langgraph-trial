# Novel Analyzer Backend

FastAPI backend providing a LangGraph-powered agent that streams AG-UI events for the novel analysis demo.

## Setup

This project uses [uv](https://github.com/astral-sh/uv) for dependency management.

```bash
cd backend
uv sync
```

Copy the example environment file and fill in the values.

```bash
cp ../.env.example .env
```

## Development

Start the FastAPI server with hot reload:

```bash
uv run fastapi dev app/main.py
```

## Formatting & Linting

No automated tooling is configured yet. Follow the repository guidelines.
