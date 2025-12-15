# Athena
Athena is an AI proxy + observability + evaluation platform with a closed-loop workflow (Logs → Dataset → Experiment) and an MCP server that lets IDE agents query and act on your AI telemetry and eval artifacts.



## Configuration

To use real AI providers, you need to configure your API keys.

1. Navigate to the `backend` directory.
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Add your API keys to `.env`:
   - **OpenAI**: [Get API Key](https://platform.openai.com/api-keys) -> `OPENAI_API_KEY`
   - **Anthropic**: [Get API Key](https://console.anthropic.com/settings/keys) -> `ANTHROPIC_API_KEY`
   - **Gemini**: [Get API Key](https://aistudio.google.com/app/apikey) -> `GEMINI_API_KEY`

> **Note**: You can use the `Mock Model` in Labs without any API keys for testing - It just doesn't do anything :D

## Run Athena locally

**Prerequisites:**  Node.js, Python 

### Option 1: Run Full Stack (Recommended)
Run both frontend and backend concurrently from the root directory:
```bash
npm install
npm run dev
```

### Option 2: Run Backend Only
```bash
cd backend
# Install dependencies if needed (fastapi uvicorn)
python -m uvicorn main:app --reload
```
Server runs on `http://localhost:8000`.

### Option 3: Run Frontend Only
```bash
cd frontend
npm install
npm run dev
```
App runs on `http://localhost:3000`.

