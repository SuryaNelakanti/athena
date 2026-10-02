import type { ChatCompletionResponse, StreamChunk } from "./types";
import { AthenaClientError } from "./errors";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function decodeChatCompletionResponse(
  payload: string,
  source: string
): ChatCompletionResponse {
  let response: unknown;
  try {
    response = JSON.parse(payload);
  } catch (error) {
    throw new AthenaClientError(`${source} returned invalid JSON.`, undefined, error);
  }
  if (!isRecord(response)) {
    throw new AthenaClientError(`${source} returned a non-object response.`);
  }
  return response as unknown as ChatCompletionResponse;
}

export async function* decodeSseStream(
  response: Response,
  requireDoneMarker: boolean
): AsyncGenerator<StreamChunk> {
  if (!response.body) {
    throw new AthenaClientError("Streaming response is missing a body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    if (done && buffer) buffer += "\n";
    const lines = buffer.split(/\r?\n/);
    buffer = done ? "" : lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) {
        continue;
      }
      const data = line.slice(5).trim();
      if (!data) {
        continue;
      }
      if (data === "[DONE]") {
        return;
      }
      try {
        const chunk: unknown = JSON.parse(data);
        yield isRecord(chunk) ? chunk : { raw: data };
      } catch {
        yield { raw: data };
      }
    }

    if (done) {
      if (requireDoneMarker) {
        throw new AthenaClientError("Athena proxy stream ended before the completion marker.");
      }
      return;
    }
  }
}
