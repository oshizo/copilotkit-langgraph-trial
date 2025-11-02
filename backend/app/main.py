from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ag_ui_langgraph import add_langgraph_fastapi_endpoint

from .agent import create_agent
from .config import get_settings


settings = get_settings()
app = FastAPI(title="Novel Analyzer API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

agent = create_agent()
add_langgraph_fastapi_endpoint(app, agent, path="/api/analyze")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
