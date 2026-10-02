export class AthenaClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly originalError?: unknown
  ) {
    super(message);
    this.name = "AthenaClientError";
  }
}
