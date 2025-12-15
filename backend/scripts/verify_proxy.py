import asyncio
import httpx
import json

BASE_URL = "http://localhost:8000/v1/chat/completions"

async def test_proxy():
    print(f"Testing Proxy at {BASE_URL}...")
    
    # Payload similar to OpenAI
    payload = {
        "model": "gpt-3.5-turbo", # This maps to OpenAI Envoy
        "messages": [
            {"role": "system", "content": "You are a test bot."},
            {"role": "user", "content": "Hello, world!"}
        ],
        "stream": True
    }
    
    print("Sending Request...")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream("POST", BASE_URL, json=payload) as response:
                if response.status_code != 200:
                    print(f"Error: {response.status_code}")
                    print(await response.read())
                    return

                print("Stream Connection Established. Reading chunks...")
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            print("\n[DONE]")
                            break
                        try:
                            json_data = json.loads(data)
                            delta = json_data['choices'][0]['delta']
                            content = delta.get('content', '')
                            if content:
                                print(content, end="", flush=True)
                        except json.JSONDecodeError:
                            print(f"(Invalid JSON: {data})")
    except Exception as e:
        print(f"Test Failed: {e}")
        print("Ensure Backend is running and API Keys are set (or expect auth error).")

if __name__ == "__main__":
    asyncio.run(test_proxy())
