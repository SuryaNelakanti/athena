import groq
from app.core.config import settings


class LLMService:
    def __init__(self):
        self.client = groq.Groq(api_key=settings.GROQ_API_KEY)

    async def generate_response(self, prompt: str, max_tokens: int = 100) -> str:
        response = await self.client.chat.completions.create(
            model="mixtral-8x7b-32768", #TODO: Add changable model var here/ env???
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content
