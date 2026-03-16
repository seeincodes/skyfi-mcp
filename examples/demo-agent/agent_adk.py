"""
SkyFi Geospatial Deep Research Agent — Google ADK
==================================================

Demo agent that uses SkyFi MCP tools for satellite imagery research.

Example prompt:
  "Analyze shipping activity at the Port of Singapore over the past 6 months."

Flow:
  1. Geocodes the location
  2. Searches SkyFi archive for imagery
  3. Checks feasibility for tasking gaps
  4. Presents curated imagery menu with pricing
  5. Waits for user confirmation before ordering
  6. Synthesizes research summary
"""

import asyncio
import os
from dotenv import load_dotenv

load_dotenv()


async def main():
    from google.adk import Agent, Runner
    from google.adk.tools.mcp import MCPToolset, SseServerParameters

    mcp_url = os.environ.get("SKYFI_MCP_URL", "http://localhost:8787/mcp")
    api_key = os.environ["SKYFI_API_KEY"]

    tools, cleanup = await MCPToolset.from_server(
        server_params=SseServerParameters(
            url=mcp_url,
            headers={"X-SkyFi-API-Key": api_key},
        )
    )

    agent = Agent(
        name="skyfi-research",
        model="gemini-2.0-flash",
        tools=tools,
        instruction="""You are a geospatial deep research assistant with access to SkyFi satellite imagery tools.

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

    runner = Runner(agent=agent, app_name="skyfi-demo", session_service=None)

    print("SkyFi Geospatial Research Agent (ADK)")
    print("=" * 40)
    print("Type your research query, or 'quit' to exit.\n")

    session = await runner.session_service.create_session(
        app_name="skyfi-demo", user_id="demo-user"
    )

    while True:
        user_input = input("You: ").strip()
        if user_input.lower() in ("quit", "exit", "q"):
            break
        if not user_input:
            continue

        async for event in runner.run_async(
            session_id=session.id, user_id="demo-user", new_message=user_input
        ):
            if hasattr(event, "text") and event.text:
                print(f"\nAgent: {event.text}\n")

    await cleanup()
    print("Goodbye!")


if __name__ == "__main__":
    asyncio.run(main())
