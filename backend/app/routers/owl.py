from __future__ import annotations

from pathlib import Path
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.services.provider_keys import ProviderKeyStore
from app.services.proxy_service import ProxyService
from app.schemas.proxy import ChatCompletionRequest, ChatMessage

router = APIRouter(prefix="/owl", tags=["owl"])


# Model preference order for Owl assistant
OWL_MODEL_PREFERENCES = [
    ("openai", "gpt-4o-mini"),
    ("anthropic", "claude-3-haiku-20240307"),
    ("gemini", "gemini-2.0-flash"),
]

# -------------------------------------------------------------------------
# System Prompts (managed server-side for security and consistency)
# -------------------------------------------------------------------------

OWL_BASE_SYSTEM_PROMPT = """You are Athena Owl, the in-app AI assistant for Athena - an AI observability and evaluation platform.

Your role:
- Help users understand and navigate the Athena platform
- Answer questions about logs, traces, datasets, experiments, and evaluations
- Provide actionable suggestions based on the current page context
- Be concise, helpful, and technically accurate

Style:
- Be conversational but professional
- Use bullet points for clarity when appropriate
- If you need more information to help, ask a clarifying question
- Don't repeat the context back unless relevant to the answer"""

OWL_ACTION_PROMPTS = {
    "aql": """You are helping the user write AQL (Athena Query Language) queries.
Available tables and fields:
- project_logs: timestamp, latency_ms, cost, total_tokens, model, provider, status, event_type
- project_traces: timestamp, total_latency, total_cost, total_tokens, status

Provide a ready-to-run AQL query with a brief explanation. Ask clarifying questions if the request is ambiguous.""",
    
    "prompt": """You are helping the user improve their AI prompts.
Focus on: clarity, safety, policy compliance, and effectiveness.
Provide the improved prompt with a brief changelog explaining why each change was made.""",
    
    "scorer": """You are helping the user design a scorer for AI evaluation.
Create a checklist of criteria to evaluate, with yes/no items and an overall scoring rubric.
Ask clarifying questions if the evaluation criteria are unclear.""",
    
    "dataset": """You are helping the user brainstorm dataset rows for AI evaluation.
Generate 5-6 diverse dataset row ideas with:
- Input scenario
- Expected behavior/output
- Tags for categorization
Focus on edge cases and realistic scenarios.""",
    
    "experiment": """You are summarizing experiment results and recommending next steps.
Analyze the provided metrics and suggest:
- Key insights from the run
- 2-3 actionable next steps
- Potential areas for improvement""",
    
    "chat": """You are having a general conversation about the Athena platform.
Help the user with their question, offering guidance on features and workflows.""",
}


class SearchDocsRequest(BaseModel):
    query: str
    limit: Optional[int] = 8


class OwlChatRequest(BaseModel):
    """Request for Owl assistant chat."""
    user_message: str  # The user's message
    action: Optional[str] = "chat"  # aql, prompt, scorer, dataset, experiment, chat
    context: Optional[dict] = None  # Page context: {page, route, project_name, params}
    conversation_history: Optional[List[dict]] = None  # Previous messages for multi-turn


class OwlChatResponse(BaseModel):
    """Response from Owl assistant."""
    content: str
    model: str
    provider: str
    trace_id: Optional[str] = None
    span_id: Optional[str] = None


def _doc_root() -> Path:
    backend_root = Path(__file__).resolve().parents[2]
    return backend_root.parent


def _list_doc_files() -> list[Path]:
    root = _doc_root()
    docs_dir = root / "docs"
    files: list[Path] = []
    for path in (root / "README.md", root / "Agents.md", root / "sdk" / "README.md"):
        if path.exists():
            files.append(path)
    if docs_dir.exists():
        files.extend(docs_dir.rglob("*.md"))
    return files


def _search_docs(query: str, limit: int) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    root = _doc_root()
    query_lower = query.lower()
    for path in _list_doc_files():
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for idx, line in enumerate(content.splitlines(), start=1):
            if query_lower in line.lower():
                results.append(
                    {
                        "path": str(path.relative_to(root)).replace("\\", "/"),
                        "line": idx,
                        "snippet": line.strip(),
                    }
                )
                if len(results) >= limit:
                    return results
    return results


def _get_available_model() -> tuple[str, str] | None:
    """Get the best available model based on configured provider keys."""
    for provider, model in OWL_MODEL_PREFERENCES:
        api_key = ProviderKeyStore.get_key(provider)
        if api_key:
            return (provider, model)
    return None


def _build_system_prompt(action: str, context: Optional[dict]) -> str:
    """Build the full system prompt from action type and context."""
    parts = [OWL_BASE_SYSTEM_PROMPT]
    
    # Add action-specific instructions
    action_prompt = OWL_ACTION_PROMPTS.get(action, OWL_ACTION_PROMPTS["chat"])
    parts.append(action_prompt)
    
    # Add page context if provided
    if context:
        context_lines = ["Current page context:"]
        if context.get("page"):
            context_lines.append(f"- Page: {context['page']}")
        if context.get("route"):
            context_lines.append(f"- Route: {context['route']}")
        if context.get("project_name"):
            context_lines.append(f"- Project: {context['project_name']}")
        if context.get("params"):
            params_str = ", ".join(f"{k}={v}" for k, v in context["params"].items() if v)
            if params_str:
                context_lines.append(f"- Params: {params_str}")
        if len(context_lines) > 1:
            parts.append("\n".join(context_lines))
    
    return "\n\n".join(parts)


@router.post("/search-docs")
async def search_docs(payload: SearchDocsRequest) -> dict[str, Any]:
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    limit = max(1, min(payload.limit or 8, 50))
    results = _search_docs(query, limit)
    return {"query": query, "count": len(results), "results": results}


@router.get("/available-model")
async def get_available_model() -> dict[str, Any]:
    """Check which model is available for Owl."""
    result = _get_available_model()
    if not result:
        return {
            "available": False,
            "provider": None,
            "model": None,
            "message": "No provider API keys configured. Add a key in Settings.",
        }
    return {
        "available": True,
        "provider": result[0],
        "model": result[1],
    }


@router.post("/chat", response_model=OwlChatResponse)
async def owl_chat(
    payload: OwlChatRequest,
    session: AsyncSession = Depends(get_session),
    x_athena_project_id: Optional[str] = Header(default=None),
) -> OwlChatResponse:
    """
    Owl assistant chat endpoint with server-managed system prompts.
    
    - Automatically selects model based on available provider keys
    - System prompts are managed server-side based on action type
    - Supports multi-turn conversations via conversation_history
    """
    # Get available model
    model_info = _get_available_model()
    if not model_info:
        raise HTTPException(
            status_code=503,
            detail="No AI provider configured. Please add an API key (OpenAI, Anthropic, or Gemini) in Settings."
        )
    
    provider, model = model_info
    project_id = x_athena_project_id or (payload.context or {}).get("project_id") or "proj_default"
    
    # Build system prompt server-side
    action = payload.action or "chat"
    system_prompt = _build_system_prompt(action, payload.context)
    
    # Build messages list
    messages = [ChatMessage(role="system", content=system_prompt)]
    
    # Add conversation history if provided
    if payload.conversation_history:
        for msg in payload.conversation_history:
            if msg.get("role") in ("user", "assistant") and msg.get("content"):
                messages.append(ChatMessage(role=msg["role"], content=msg["content"]))
    
    # Add current user message
    messages.append(ChatMessage(role="user", content=payload.user_message))
    
    # Create proxy request
    request = ChatCompletionRequest(
        model=model,
        provider=provider,
        messages=messages,
        temperature=0.2,
        max_tokens=1024,
        stream=False,
    )
    
    # Call proxy service
    proxy_service = ProxyService(session)
    try:
        response = await proxy_service.chat_completion(request, project_id=project_id)
        
        # Extract content from response
        content = ""
        if response.choices and response.choices[0].message:
            content = response.choices[0].message.content or ""
        
        return OwlChatResponse(
            content=content,
            model=model,
            provider=provider,
            trace_id=response.trace_id,
            span_id=response.span_id,
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Owl chat failed: {str(e)}")
