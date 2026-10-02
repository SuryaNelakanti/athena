"""
Athena SDK Example: RAG Application
Theme: Purple (#7C3AED)

Demonstrates retrieval-augmented generation with separate trace spans.
"""
import streamlit as st
import sys
import os
import json
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'sdk', 'python'))

from athena_sdk import AthenaClient, new_trace_context, context_from_response

st.set_page_config(page_title="Athena RAG", page_icon="📚", layout="wide")

# Purple theme
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root {
    --bg: #F5F3F7;
    --ink: #0C0C0C;
    --accent: #7C3AED;
    --surface: #FFFFFF;
}

.stApp { background-color: var(--bg); font-family: 'IBM Plex Mono', monospace; }
.main-header { font-size: 2.5rem; font-weight: 600; border-bottom: 3px solid var(--ink); padding-bottom: 1rem; margin-bottom: 2rem; }
.accent-text { color: #7C3AED; }

.doc-card {
    border: 2px solid var(--ink);
    background: var(--surface);
    padding: 1rem;
    margin: 0.5rem 0;
}

.doc-header {
    background: #7C3AED;
    color: white;
    padding: 4px 8px;
    font-size: 0.75rem;
    font-weight: 600;
    display: inline-block;
    margin-bottom: 0.5rem;
}

.relevance-bar {
    height: 4px;
    background: linear-gradient(90deg, #7C3AED var(--score), #ddd var(--score));
    margin-top: 0.5rem;
}

.stButton > button {
    background: #7C3AED !important;
    color: white !important;
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

# Mock knowledge base
KNOWLEDGE_BASE = [
    {"id": "doc_001", "title": "Athena Overview", "content": "Athena is an AI proxy + observability + evaluation platform with a closed-loop workflow.", "tags": ["athena", "overview"]},
    {"id": "doc_002", "title": "Proxy API", "content": "The Athena proxy provides unified inference across providers via POST /v1/chat/completions.", "tags": ["proxy", "api"]},
    {"id": "doc_003", "title": "Tracing", "content": "Athena supports distributed tracing with trace_id, span_id, and parent_span_id for nested spans.", "tags": ["tracing", "observability"]},
    {"id": "doc_004", "title": "Datasets", "content": "Datasets in Athena are versioned collections used for evaluation and analysis.", "tags": ["datasets", "evaluation"]},
    {"id": "doc_005", "title": "Experiments", "content": "Experiments run tasks against datasets with configurable scorers for quality assessment.", "tags": ["experiments", "scoring"]},
    {"id": "doc_006", "title": "MCP Server", "content": "The MCP server exposes Athena tools to IDE agents via HTTP MCP + OAuth.", "tags": ["mcp", "ide"]},
]

def mock_retrieval(query: str, top_k: int = 3):
    """Simulate vector retrieval with relevance scores."""
    import random
    results = []
    query_lower = query.lower()

    for doc in KNOWLEDGE_BASE:
        score = 0.0
        # Simple keyword matching for demo
        for word in query_lower.split():
            if word in doc["title"].lower() or word in doc["content"].lower():
                score += 0.3
            if word in doc["tags"]:
                score += 0.2
        score = min(score + random.uniform(0.1, 0.3), 1.0)
        results.append({**doc, "score": round(score, 2)})

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]

st.markdown('<div class="main-header">📚 Athena <span class="accent-text">RAG</span></div>', unsafe_allow_html=True)

# Sidebar
with st.sidebar:
    st.markdown("### ⚙️ Configuration")
    base_url = st.text_input("Athena URL", value="http://localhost:8000")
    model = st.selectbox("Model", ["gpt-4o-mini", "gpt-4o"])
    top_k = st.slider("Top K Documents", 1, 5, 3)

    st.markdown("---")
    st.markdown("### 📖 Knowledge Base")
    st.caption(f"{len(KNOWLEDGE_BASE)} documents indexed")
    for doc in KNOWLEDGE_BASE:
        with st.expander(doc["title"]):
            st.caption(doc["content"][:100] + "...")

# Init state
if "messages" not in st.session_state:
    st.session_state.messages = []
if "retrievals" not in st.session_state:
    st.session_state.retrievals = []

# Display messages
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if "docs" in msg:
            st.markdown("**Retrieved Documents:**")
            for doc in msg["docs"]:
                score_pct = int(doc["score"] * 100)
                st.markdown(f'''
                <div class="doc-card">
                    <span class="doc-header">📄 {doc["title"]} ({score_pct}%)</span>
                    <p style="font-size: 0.85rem; margin: 0.5rem 0 0 0;">{doc["content"][:150]}...</p>
                    <div class="relevance-bar" style="--score: {score_pct}%;"></div>
                </div>
                ''', unsafe_allow_html=True)

# Chat input
if prompt := st.chat_input("Ask about Athena..."):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        try:
            client = AthenaClient(base_url=base_url, project_id="proj_default")
            root_context = new_trace_context()

            # Step 1: Retrieval span
            with st.spinner("🔍 Retrieving documents..."):
                # Log retrieval as a span via proxy call
                retrieval_response = client.chat_completion(
                    {"model": model, "messages": [{"role": "system", "content": f"Retrieval query: {prompt}"}]},
                    trace_context=root_context
                )
                retrieval_context = context_from_response(retrieval_response, fallback=root_context)

                retrieved_docs = mock_retrieval(prompt, top_k)
                st.session_state.retrievals.append({"query": prompt, "docs": retrieved_docs})
                time.sleep(0.5)

            # Display retrieved docs
            st.markdown("**Retrieved Documents:**")
            for doc in retrieved_docs:
                score_pct = int(doc["score"] * 100)
                st.markdown(f'''
                <div class="doc-card">
                    <span class="doc-header">📄 {doc["title"]} ({score_pct}%)</span>
                    <p style="font-size: 0.85rem; margin: 0.5rem 0 0 0;">{doc["content"][:150]}...</p>
                    <div class="relevance-bar" style="--score: {score_pct}%;"></div>
                </div>
                ''', unsafe_allow_html=True)

            # Step 2: Generation span
            with st.spinner("✨ Generating response..."):
                context_str = "\n".join([f"[{d['title']}]: {d['content']}" for d in retrieved_docs])

                response = client.chat_completion(
                    {"model": model, "messages": [
                        {"role": "system", "content": f"Use the following context to answer:\n\n{context_str}"},
                        {"role": "user", "content": prompt}
                    ]},
                    trace_context=retrieval_context
                )

                answer = response["choices"][0]["message"]["content"]
                st.markdown("---")
                st.markdown(answer)

                st.session_state.messages.append({"role": "assistant", "content": answer, "docs": retrieved_docs})

        except Exception as e:
            st.error(f"Error: {e}")

st.markdown("---")
st.caption("Powered by Athena SDK • Retrieval + Generation traces")
