"""
Athena SDK Example: Simple Chatbot
Theme: Classic Athena Orange (#FF4400)

A minimal Streamlit chat interface using the Athena proxy.
"""
import streamlit as st
import sys
import os

# Add SDK to path for development
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'sdk', 'python'))

from athena_sdk import AthenaClient, new_trace_context, context_from_response

# Page config with custom theme
st.set_page_config(
    page_title="Athena Chatbot",
    page_icon="🦉",
    layout="wide"
)

# Custom CSS - Orange theme
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root {
    --bg: #F7F7F2;
    --ink: #0C0C0C;
    --accent: #FF4400;
    --surface: #FFFFFF;
}

.stApp {
    background-color: var(--bg);
    font-family: 'IBM Plex Mono', monospace;
}

.main-header {
    font-size: 2.5rem;
    font-weight: 600;
    color: var(--ink);
    border-bottom: 3px solid var(--ink);
    padding-bottom: 1rem;
    margin-bottom: 2rem;
}

.accent-text { color: #FF4400; }

.chat-container {
    border: 2px solid var(--ink);
    background: var(--surface);
    padding: 1.5rem;
    margin: 1rem 0;
}

.trace-badge {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.7rem;
    background: var(--ink);
    color: var(--bg);
    padding: 4px 8px;
    letter-spacing: 0.1em;
}

.stChatMessage {
    border: 2px solid var(--ink) !important;
    background: var(--surface) !important;
}

div[data-testid="stChatInput"] > div {
    border: 2px solid var(--ink) !important;
    border-radius: 0 !important;
}

.stButton > button {
    background: #FF4400 !important;
    color: var(--ink) !important;
    border: 2px solid var(--ink) !important;
    border-radius: 0 !important;
    font-family: 'IBM Plex Mono', monospace !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.1em !important;
    box-shadow: 4px 4px 0 var(--ink) !important;
}

.stButton > button:hover {
    transform: translate(2px, 2px);
    box-shadow: 2px 2px 0 var(--ink) !important;
}
</style>
""", unsafe_allow_html=True)

# Header
st.markdown('<div class="main-header">🦉 Athena <span class="accent-text">Chatbot</span></div>', unsafe_allow_html=True)

# Sidebar
with st.sidebar:
    st.markdown("### ⚙️ Configuration")
    base_url = st.text_input("Athena URL", value="http://localhost:8000")
    model = st.selectbox("Model", ["gpt-4o-mini", "gpt-4o", "claude-3-haiku-20240307"])

    st.markdown("---")
    st.markdown("### 📊 Trace Info")

    if "traces" in st.session_state and st.session_state.traces:
        for i, trace_id in enumerate(st.session_state.traces[-5:]):
            st.markdown(f'<span class="trace-badge">{trace_id[:20]}...</span>', unsafe_allow_html=True)
    else:
        st.caption("No traces yet")

# Initialize
if "messages" not in st.session_state:
    st.session_state.messages = []
if "traces" not in st.session_state:
    st.session_state.traces = []

# Display messages
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Chat input
if prompt := st.chat_input("Type your message...", key="chat_input"):
    # Add user message
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # Get response
    with st.chat_message("assistant"):
        with st.spinner("Thinking..."):
            try:
                client = AthenaClient(base_url=base_url, project_id="proj_default")
                context = new_trace_context()

                response = client.chat_completion(
                    {
                        "model": model,
                        "messages": [{"role": m["role"], "content": m["content"]} for m in st.session_state.messages]
                    },
                    trace_context=context
                )

                assistant_message = response["choices"][0]["message"]["content"]
                st.markdown(assistant_message)

                # Store trace
                trace_id = response.get("trace_id", context.trace_id)
                st.session_state.traces.append(trace_id)
                st.session_state.messages.append({"role": "assistant", "content": assistant_message})

            except Exception as e:
                st.error(f"Error: {e}")

# Footer
st.markdown("---")
st.caption("Powered by Athena SDK • Traces visible in Athena Dashboard")
