/** Deterministic varied bytes, so a test can tell real content from an empty, zeroed or stringified body. */
export function patternBytes(length: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length }, (_, i) => (i * 7 + 13) % 256);
}

/** Reads a request body the way a storage server would see it. */
export async function bodyBytes(
  request: Request,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await request.arrayBuffer());
}
