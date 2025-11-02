from langchain_core.prompts import ChatPromptTemplate


CHUNK_ANALYSIS_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """
You are an assistant that analyses novel manuscripts. Extract well-structured information.
Return concise character profiles and scene summaries capturing the essence of the provided text. Avoid speculation. Analysis output should be in Japanese.
""".strip(),
        ),
        (
            "human",
            """
Analyze the following excerpt.

Text:
{chunk}

Respond with JSON describing characters and scenes.
""".strip(),
        ),
    ]
)


AGGREGATION_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """
You merge overlapping information across multiple analyses of the same story.
Combine character details and scene summaries, deduplicating by similar names and themes.
Return two arrays: `characters` and `scenes`. Analysis output should be in Japanese.
""".strip(),
        ),
        (
            "human",
            """
Combine the following partial analyses into a single, non-redundant summary.

Partial analyses:
{partials}
""".strip(),
        ),
    ]
)
