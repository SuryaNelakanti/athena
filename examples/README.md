# Athena SDK Examples

Example applications to demonstrate and dogfood the Athena SDK.

## Prerequisites

1. **Start Athena backend** from the repo root:
   ```bash
   npm start
   ```

2. **Install Python SDK** (for Python examples):
   ```bash
   pip install -e sdk/python
   ```

## Examples

| Example | Type | Description | Theme |
|---------|------|-------------|-------|
| [chatbot.py](python/chatbot.py) | Streamlit | Simple chat interface | 🟠 Orange |
| [agent.py](python/agent.py) | Streamlit | Multi-turn agent with tools | 🟢 Teal |
| [rag.py](python/rag.py) | Streamlit | RAG with retrieval traces | 🟣 Purple |
| [eval_runner.py](python/eval_runner.py) | Streamlit | Batch evaluation runner | 🔵 Blue |
| [chat.html](typescript/chat.html) | HTML/JS | Streaming web chat | 🩷 Pink |
| [dashboard.html](typescript/dashboard.html) | HTML/JS | Cost/token dashboard | 🟡 Amber |

## Running Python Examples

```bash
cd examples/python
pip install -r requirements.txt
streamlit run chatbot.py
```

## Running TypeScript Examples

Open the HTML files directly in your browser, or serve them:
```bash
cd examples/typescript
npx serve .
```

## Testing

```bash
npx playwright test examples.spec.ts
```
