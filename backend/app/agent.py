from ag_ui_langgraph import LangGraphAgent

from .config import get_settings
from .graph import build_agent_graph


def create_agent() -> LangGraphAgent:
    settings = get_settings()
    graph = build_agent_graph(settings)
    return LangGraphAgent(name="novel-analyzer", graph=graph, description="Analyzes novel manuscripts for characters and scenes")
