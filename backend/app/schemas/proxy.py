from typing import List, Optional, Dict, Any, Union, Literal
from pydantic import BaseModel, Field
import time

# --- Common Types ---

class ChatMessage(BaseModel):
    role: str
    content: str
    name: Optional[str] = None

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = 1.0
    top_p: Optional[float] = 1.0
    n: Optional[int] = 1
    stream: Optional[bool] = False
    stop: Optional[Union[str, List[str]]] = None
    max_tokens: Optional[int] = None
    presence_penalty: Optional[float] = 0.0
    frequency_penalty: Optional[float] = 0.0
    logit_bias: Optional[Dict[str, float]] = None
    user: Optional[str] = None
    
    # Athena Extensions
    provider: Optional[str] = None # Force specific provider if model name is ambiguous
    trace_id: Optional[str] = None # Parent trace ID for context propagation
    parent_span_id: Optional[str] = None # Parent span ID for span nesting
    trace_group_id: Optional[str] = None # Group or session identifier for related traces
    project_id: Optional[str] = None # Target project for this request

class ChatCompletionChoice(BaseModel):
    index: int
    message: ChatMessage
    finish_reason: Optional[str] = None

class Usage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    # Extended metrics
    cost: Optional[float] = 0.0
    latency_ms: Optional[float] = 0.0

class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int = Field(default_factory=lambda: int(time.time()))
    model: str
    choices: List[ChatCompletionChoice]
    usage: Optional[Usage] = None
    
    # Athena Extensions
    system_fingerprint: Optional[str] = None
    provider: Optional[str] = None
    
    # Trace Context (returned to client for correlation)
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    
    # Reasoning Normalization: Separate channel for model reasoning/thinking
    athena_reasoning: Optional[str] = None

class ProviderConfig(BaseModel):
    provider_name: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    api_version: Optional[str] = None
    organization_id: Optional[str] = None # OpenAI specific
    project_id: Optional[str] = None # Google/Anthropic specific

# --- Streaming Types ---

class ChatCompletionChunkDelta(BaseModel):
    role: Optional[str] = None
    content: Optional[str] = None
    
    # Athena Extension: Distinct Reasoning Channel
    # This allows reasoning to be streamed without polluting the main 'content'
    reasoning_content: Optional[str] = None 

class ChatCompletionChunkChoice(BaseModel):
    index: int
    delta: ChatCompletionChunkDelta
    finish_reason: Optional[str] = None

class ChatCompletionChunk(BaseModel):
    id: str
    object: str = "chat.completion.chunk"
    created: int = Field(default_factory=lambda: int(time.time()))
    model: str
    choices: List[ChatCompletionChunkChoice]
    # Athena Extensions
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    
class ModelCard(BaseModel):
    id: str
    object: str = "model"
    created: int = Field(default_factory=lambda: int(time.time()))
    owned_by: str
    
class ModelListResponse(BaseModel):
    object: str = "list"
    data: List[ModelCard]
