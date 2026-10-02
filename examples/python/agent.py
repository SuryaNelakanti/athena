"""
Athena SDK Example: Multi-turn Agent with Tools
Theme: Teal (#00D4AA)

Demonstrates parent-child span linking for tool calls.
"""
import streamlit as st
import sys
import os
import json
import time
import random

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'sdk', 'python'))

from athena_sdk import AthenaClient, new_trace_context, context_from_response

st.set_page_config(page_title="Athena Agent", page_icon="🤖", layout="wide")

# Teal theme
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root {
    --bg: #F2F7F5;
    --ink: #0C0C0C;
    --accent: #00D4AA;
    --surface: #FFFFFF;
}

.stApp { background-color: var(--bg); font-family: 'IBM Plex Mono', monospace; }
.main-header { font-size: 2.5rem; font-weight: 600; border-bottom: 3px solid var(--ink); padding-bottom: 1rem; margin-bottom: 2rem; }
.accent-text { color: #00D4AA; }

.tool-card {
    border: 2px solid var(--ink);
    background: var(--surface);
    padding: 1rem;
    margin: 0.5rem 0;
    font-family: 'IBM Plex Mono', monospace;
}

.tool-header {
    background: #00D4AA;
    color: var(--ink);
    padding: 4px 8px;
    font-size: 0.8rem;
    font-weight: 600;
    display: inline-block;
    margin-bottom: 0.5rem;
}

.span-tree {
    border-left: 3px solid #00D4AA;
    padding-left: 1rem;
    margin: 1rem 0;
}

.stButton > button {
    background: #00D4AA !important;
    color: var(--ink) !important;
    border: 2px solid var(--ink) !important;
    border-radius: 0 !important;
    font-family: 'IBM Plex Mono', monospace !important;
    font-weight: 600 !important;
    box-shadow: 4px 4px 0 var(--ink) !important;
}

div[data-testid="stChatInput"] > div {
    border: 2px solid var(--ink) !important;
    border-radius: 0 !important;
}
</style>
""", unsafe_allow_html=True)

# Simulated tools
TOOLS = {
    "search_web": lambda q: {"results": [f"Result for '{q}': Found relevant information about {q}"]},
    "get_weather": lambda loc: {"location": loc, "temp": random.randint(15, 35), "condition": random.choice(["sunny", "cloudy", "rainy"])},
    "calculate": lambda expr: {"result": eval(expr) if expr.replace('.','').replace('+','').replace('-','').replace('*','').replace('/','').replace(' ','').isdigit() or True else "Error"},
}

st.markdown('<div class="main-header">🤖 Athena <span class="accent-text">Agent</span></div>', unsafe_allow_html=True)

# Sidebar
with st.sidebar:
    st.markdown("### ⚙️ Configuration")
    base_url = st.text_input("Athena URL", value="http://localhost:8000")
    model = st.selectbox("Model", ["gpt-4o-mini", "gpt-4o"])

    st.markdown("---")
    st.markdown("### 🔧 Available Tools")
    for tool in TOOLS.keys():
        st.markdown(f'<span class="tool-header">{tool}</span>', unsafe_allow_html=True)

    st.markdown("---")
    st.markdown("### 📊 Span Tree")
    if "span_tree" in st.session_state:
        for span in st.session_state.span_tree[-10:]:
            indent = "  " * span.get("depth", 0)
            st.code(f"{indent}├─ {span['type']}: {span['id'][:12]}...")

# Init state
if "messages" not in st.session_state:
    st.session_state.messages = []
if "span_tree" not in st.session_state:
    st.session_state.span_tree = []

# Display messages
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if "tools" in msg:
            for tool in msg["tools"]:
                st.markdown(f'''
                <div class="tool-card">
                    <span class="tool-header">🔧 {tool["name"]}</span>
                    <pre>{json.dumps(tool["result"], indent=2)}</pre>
                </div>
                ''', unsafe_allow_html=True)

# Chat input
if prompt := st.chat_input("Ask me anything (try: 'What's the weather in Tokyo?')"):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        with st.spinner("Agent thinking..."):
            try:
                client = AthenaClient(base_url=base_url, project_id="proj_default")
                root_context = new_trace_context()

                # Record root span
                st.session_state.span_tree.append({"type": "agent_start", "id": root_context.trace_id, "depth": 0})

                # Simulate tool detection and execution
                tool_results = []
                detected_tools = []

                if "weather" in prompt.lower():
                    detected_tools.append(("get_weather", "Tokyo"))
                if "search" in prompt.lower() or "find" in prompt.lower():
                    detected_tools.append(("search_web", prompt))
                if any(op in prompt for op in ["+", "-", "*", "/", "calculate"]):
                    detected_tools.append(("calculate", "2+2"))

                # Execute tools with child spans
                for tool_name, tool_arg in detected_tools:
                    # Create child context for tool call
                    tool_response = client.chat_completion(
                        {"model": model, "messages": [{"role": "user", "content": f"Execute {tool_name}({tool_arg})"}]},
                        trace_context=root_context
                    )
                    child_context = context_from_response(tool_response, fallback=root_context)

                    # Record tool span
                    st.session_state.span_tree.append({"type": f"tool:{tool_name}", "id": child_context.span_id or "unknown", "depth": 1})

                    # Execute tool
                    result = TOOLS[tool_name](tool_arg)
                    tool_results.append({"name": tool_name, "arg": tool_arg, "result": result})
                    time.sleep(0.3)  # Simulate latency

                # Final response
                response = client.chat_completion(
                    {"model": model, "messages": [
                        {"role": "user", "content": prompt},
                        {"role": "system", "content": f"Tool results: {json.dumps(tool_results)}"}
                    ]},
                    trace_context=root_context
                )

                final_context = context_from_response(response, fallback=root_context)
                st.session_state.span_tree.append({"type": "llm_response", "id": final_context.span_id or "unknown", "depth": 1})

                assistant_msg = response["choices"][0]["message"]["content"]
                st.markdown(assistant_msg)

                # Show tool cards
                for tool in tool_results:
                    st.markdown(f'''
                    <div class="tool-card">
                        <span class="tool-header">🔧 {tool["name"]}({tool["arg"]})</span>
                        <pre>{json.dumps(tool["result"], indent=2)}</pre>
                    </div>
                    ''', unsafe_allow_html=True)

                st.session_state.messages.append({"role": "assistant", "content": assistant_msg, "tools": tool_results})

            except Exception as e:
                st.error(f"Error: {e}")

st.markdown("---")
st.caption("Powered by Athena SDK • Multi-span agent traces")
