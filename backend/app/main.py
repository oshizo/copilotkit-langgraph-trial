from ag_ui_langgraph import add_langgraph_fastapi_endpoint, LangGraphAgent
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .graph import build_agent_graph
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


agent = LangGraphAgent(
    name="novel-analyzer",
    graph=build_agent_graph(settings),
    description="Analyzes novel manuscripts for characters and scenes",
)

add_langgraph_fastapi_endpoint(app, agent, path="/api/analyze")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
