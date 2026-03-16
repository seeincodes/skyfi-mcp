"""
SkyFi Geospatial Deep Research Agent — LangChain/LangGraph
==========================================================

LangChain variant of the demo agent with a confirmation graph node.

Example prompt:
  "Analyze shipping activity at the Port of Singapore over the past 6 months."
"""

import asyncio
import os
from dotenv import load_dotenv

load_dotenv()


async def main():
    from langchain_anthropic import ChatAnthropic
    from langchain_mcp_adapters.client import MultiServerMCPClient
    from langgraph.prebuilt import create_react_agent

    mcp_url = os.environ.get("SKYFI_MCP_URL", "http://localhost:8787/mcp")
    api_key = os.environ["SKYFI_API_KEY"]

    async with MultiServerMCPClient({
        "skyfi": {
            "url": mcp_url,
            "transport": "streamable_http",
            "headers": {"X-SkyFi-API-Key": api_key},
        }
    }) as mcp_client:
        tools = mcp_client.get_tools()

        model = ChatAnthropic(model="claude-sonnet-4-20250514")

        agent = create_react_agent(
            model,
            tools,
            prompt="""You are a geospatial deep research assistant with access to SkyFi satellite imagery tools.

Your workflow for research requests:
1. Geocode the location to get coordinates
2. Get a bounding box for the area of interest
3. Search the archive for available imagery across the date range
4. Present findings with pricing to the user
5. If the user wants imagery that doesn't exist, check capture feasibility
6. Always present quotes and wait for explicit confirmation before ordering
7. After ordering, monitor status and deliver results

Be thorough in your analysis. Present data in structured formats.
Never place orders without user confirmation.""",
        )

        print("SkyFi Geospatial Research Agent (LangChain)")
        print("=" * 45)
        print("Type your research query, or 'quit' to exit.\n")

        while True:
            user_input = input("You: ").strip()
            if user_input.lower() in ("quit", "exit", "q"):
                break
            if not user_input:
                continue

            result = await agent.ainvoke({"messages": [("human", user_input)]})

            for msg in result["messages"]:
                if hasattr(msg, "content") and isinstance(msg.content, str) and msg.content:
                    print(f"\nAgent: {msg.content}\n")

    print("Goodbye!")


if __name__ == "__main__":
    asyncio.run(main())
