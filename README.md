# Athena
Athena is an AI proxy + observability + evaluation platform with a closed-loop workflow (Logs → Dataset → Experiment) and an MCP server that lets IDE agents query and act on your AI telemetry and eval artifacts.



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

