import os
from typing import AsyncGenerator, Optional, List
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from app.schemas.proxy import ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk, ProviderConfig, ChatCompletionChoice, ChatMessage, Usage, ChatCompletionChunkChoice, ChatCompletionChunkDelta
from app.providers.base import TitanEnvoy
import time

class GeminiEnvoy(TitanEnvoy):
    def __init__(self, config: Optional[ProviderConfig] = None):
        self.config = config
        api_key = config.api_key if config else os.getenv("GEMINI_API_KEY")
        self._has_api_key = bool(api_key)
        if not api_key:
            print("Warning: GEMINI_API_KEY not found.")
        else:
            genai.configure(api_key=api_key)

    def _prepare_history(self, messages: List[ChatMessage]):
        history = []
        system_instruction = None
        
        # Extract system instruction if it's the first message(s)
        # Google SDK supports system_instruction in GenerativeModel constructor
        
        non_system_messages = []
        for m in messages:
            if m.role == "system":
                if system_instruction:
                    system_instruction += f"\n{m.content}"
                else:
                    system_instruction = m.content
            else:
                non_system_messages.append(m)

        for m in non_system_messages:
            role = "user" if m.role == "user" else "model"
            history.append({"role": role, "parts": [m.content]})
            
        return system_instruction, history

    async def chat_completion(self, request: ChatCompletionRequest) -> ChatCompletionResponse:
        if not self._has_api_key:
            raise RuntimeError("GEMINI_API_KEY not configured.")
        system_instruction, history = self._prepare_history(request.messages)
        
        model = genai.GenerativeModel(
            model_name=request.model,
            system_instruction=system_instruction
        )
        
        gen_config = genai.types.GenerationConfig(
            candidate_count=request.n,
            max_output_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            stop_sequences=[request.stop] if isinstance(request.stop, str) else request.stop
        )

        start_time = time.time()
        # history for chat session not strictly needed if we just pass contents to generate_content?
        # Actually generate_content takes contents list which acts as history
        
        response = await model.generate_content_async(
            contents=history,
            generation_config=gen_config
        )
        latency = (time.time() - start_time) * 1000

        # Map response
        return ChatCompletionResponse(
            id="gemini-" + str(int(time.time())), # Gemini doesn't give a clear ID
            model=request.model,
            created=int(time.time()),
            choices=[
                ChatCompletionChoice(
                    index=0,
                    message=ChatMessage(
                        role="assistant",
                        content=response.text
                    ),
                    finish_reason="stop" # simplistic mapping
                )
            ],
            usage=Usage(
                prompt_tokens=0, # Need to use count_tokens to get this, expensive?
                completion_tokens=0,
                total_tokens=0,
                latency_ms=latency
            ),
            provider="gemini"
        )

    async def stream_chat_completion(self, request: ChatCompletionRequest) -> AsyncGenerator[ChatCompletionChunk, None]:
        if not self._has_api_key:
            raise RuntimeError("GEMINI_API_KEY not configured.")
        system_instruction, history = self._prepare_history(request.messages)
        
        model = genai.GenerativeModel(
            model_name=request.model,
            system_instruction=system_instruction
        )
         
        gen_config = genai.types.GenerationConfig(
            candidate_count=request.n,
            max_output_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            stop_sequences=[request.stop] if isinstance(request.stop, str) else request.stop
        )

        stream = await model.generate_content_async(
            contents=history,
            generation_config=gen_config,
            stream=True
        )
        
        async for chunk in stream:
            yield ChatCompletionChunk(
                id=f"gemini-{int(time.time())}",
                model=request.model,
                choices=[
                    ChatCompletionChunkChoice(
                        index=0,
                        delta=ChatCompletionChunkDelta(
                            content=chunk.text
                        ),
                        finish_reason=None
                    )
                ]
            )

    async def list_models(self) -> List[str]:
        # Keep this static to avoid requiring network access at runtime.
        return [
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-1.5-pro",
        ]
