"""
Athena SDK Example: Batch Evaluation Runner
Theme: Blue (#0EA5E9)

Run a dataset of prompts through Athena and collect metrics.
"""
import streamlit as st
import sys
import os
import time
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'sdk', 'python'))

from athena_sdk import AthenaClient, new_trace_context

st.set_page_config(page_title="Athena Eval Runner", page_icon="📊", layout="wide")

# Blue theme
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root {
    --bg: #F3F7FA;
    --ink: #0C0C0C;
    --accent: #0EA5E9;
    --surface: #FFFFFF;
}

.stApp { background-color: var(--bg); font-family: 'IBM Plex Mono', monospace; }
.main-header { font-size: 2.5rem; font-weight: 600; border-bottom: 3px solid var(--ink); padding-bottom: 1rem; margin-bottom: 2rem; }
.accent-text { color: #0EA5E9; }

.metric-card {
    border: 2px solid var(--ink);
    background: var(--surface);
    padding: 1.5rem;
    text-align: center;
}

.metric-value {
    font-size: 2rem;
    font-weight: 600;
    color: #0EA5E9;
}

.metric-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #666;
}

.result-row {
    border: 2px solid var(--ink);
    background: var(--surface);
    padding: 1rem;
    margin: 0.5rem 0;
}

.status-pass { color: #10B981; }
.status-fail { color: #EF4444; }

.stButton > button {
    background: #0EA5E9 !important;
    color: white !important;
    border: 2px solid var(--ink) !important;
    border-radius: 0 !important;
    font-family: 'IBM Plex Mono', monospace !important;
    font-weight: 600 !important;
    box-shadow: 4px 4px 0 var(--ink) !important;
}

.stProgress > div > div {
    background: #0EA5E9 !important;
}
</style>
""", unsafe_allow_html=True)

# Sample dataset
DEFAULT_DATASET = [
    {"input": "What is 2 + 2?", "expected": "4"},
    {"input": "Capital of France?", "expected": "Paris"},
    {"input": "Who wrote Romeo and Juliet?", "expected": "Shakespeare"},
    {"input": "What color is the sky?", "expected": "blue"},
    {"input": "Largest planet in solar system?", "expected": "Jupiter"},
]

st.markdown('<div class="main-header">📊 Athena <span class="accent-text">Eval Runner</span></div>', unsafe_allow_html=True)

# Sidebar
with st.sidebar:
    st.markdown("### ⚙️ Configuration")
    base_url = st.text_input("Athena URL", value="http://localhost:8000")
    model = st.selectbox("Model", ["gpt-4o-mini", "gpt-4o"])

    st.markdown("---")
    st.markdown("### 📋 Dataset")
    dataset_json = st.text_area(
        "Dataset (JSON)",
        value=json.dumps(DEFAULT_DATASET, indent=2),
        height=300
    )

    try:
        dataset = json.loads(dataset_json)
        st.success(f"✓ {len(dataset)} rows loaded")
    except:
        st.error("Invalid JSON")
        dataset = []

# Main content
col1, col2, col3, col4 = st.columns(4)

# Init state
if "results" not in st.session_state:
    st.session_state.results = []
if "running" not in st.session_state:
    st.session_state.running = False

# Metrics
total = len(st.session_state.results)
passed = sum(1 for r in st.session_state.results if r.get("passed"))
avg_latency = sum(r.get("latency_ms", 0) for r in st.session_state.results) / max(total, 1)
total_tokens = sum(r.get("tokens", 0) for r in st.session_state.results)

with col1:
    st.markdown(f'''
    <div class="metric-card">
        <div class="metric-value">{total}</div>
        <div class="metric-label">Total Runs</div>
    </div>
    ''', unsafe_allow_html=True)

with col2:
    st.markdown(f'''
    <div class="metric-card">
        <div class="metric-value">{passed}/{total}</div>
        <div class="metric-label">Passed</div>
    </div>
    ''', unsafe_allow_html=True)

with col3:
    st.markdown(f'''
    <div class="metric-card">
        <div class="metric-value">{avg_latency:.0f}ms</div>
        <div class="metric-label">Avg Latency</div>
    </div>
    ''', unsafe_allow_html=True)

with col4:
    st.markdown(f'''
    <div class="metric-card">
        <div class="metric-value">{total_tokens}</div>
        <div class="metric-label">Total Tokens</div>
    </div>
    ''', unsafe_allow_html=True)

st.markdown("---")

# Run button
col_btn1, col_btn2 = st.columns([1, 4])
with col_btn1:
    run_clicked = st.button("▶ Run Evaluation", use_container_width=True)
with col_btn2:
    if st.button("🗑 Clear Results"):
        st.session_state.results = []
        st.rerun()

# Run evaluation
if run_clicked and dataset:
    st.session_state.results = []
    progress_bar = st.progress(0)
    status_text = st.empty()

    client = AthenaClient(base_url=base_url, project_id="proj_default")

    for i, row in enumerate(dataset):
        status_text.text(f"Running {i+1}/{len(dataset)}: {row['input'][:50]}...")

        start_time = time.time()
        context = new_trace_context()

        try:
            response = client.chat_completion(
                {"model": model, "messages": [{"role": "user", "content": row["input"]}]},
                trace_context=context
            )

            latency_ms = (time.time() - start_time) * 1000
            output = response["choices"][0]["message"]["content"]
            tokens = response.get("usage", {}).get("total_tokens", 0)

            # Simple pass/fail check
            passed = row.get("expected", "").lower() in output.lower()

            st.session_state.results.append({
                "input": row["input"],
                "expected": row.get("expected", ""),
                "output": output,
                "passed": passed,
                "latency_ms": latency_ms,
                "tokens": tokens,
                "trace_id": response.get("trace_id", context.trace_id)
            })

        except Exception as e:
            st.session_state.results.append({
                "input": row["input"],
                "expected": row.get("expected", ""),
                "output": f"ERROR: {e}",
                "passed": False,
                "latency_ms": 0,
                "tokens": 0,
                "trace_id": context.trace_id
            })

        progress_bar.progress((i + 1) / len(dataset))

    status_text.text("✓ Evaluation complete!")
    st.rerun()

# Results table
if st.session_state.results:
    st.markdown("### Results")

    for i, result in enumerate(st.session_state.results):
        status_class = "status-pass" if result["passed"] else "status-fail"
        status_icon = "✓" if result["passed"] else "✗"

        with st.expander(f"{status_icon} Row {i+1}: {result['input'][:50]}..."):
            col_a, col_b = st.columns(2)
            with col_a:
                st.markdown("**Input:**")
                st.code(result["input"])
                st.markdown("**Expected:**")
                st.code(result["expected"])
            with col_b:
                st.markdown("**Output:**")
                st.code(result["output"][:500])
                st.markdown(f"**Latency:** {result['latency_ms']:.0f}ms | **Tokens:** {result['tokens']}")
                st.caption(f"Trace: {result['trace_id']}")

st.markdown("---")
st.caption("Powered by Athena SDK • Batch evaluation with metrics")
