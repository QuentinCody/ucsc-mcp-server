// Requests are constructed against https://api.genome.ucsc.edu by request.ts.
export interface UcscText {
  status: number;
  text: string;
  source_url: string;
  retrieved_at: string;
  body_bytes: number;
  body_sha256: string;
  content_type: string;
  etag: string | null;
}

export function rejectUcscResponse(message: string, data: UcscText): never {
  throw Object.assign(new Error(message), { status: data.status >= 200 && data.status < 300 ? 502 : data.status, data });
}

/** One bounded GET: the deadline includes both response headers and body reads. */
export async function ucscFetch(url: string, maxBytes = 8 * 1024 * 1024, timeoutMs = 30_000): Promise<UcscText> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("UCSC response deadline exceeded"));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([fetch(url, {
      method: "GET", headers: { Accept: "application/json, text/plain;q=0.8" },
      redirect: "manual", signal: controller.signal,
    }), expired]);
    if (Number(response.headers.get("content-length")) > maxBytes) throw new Error("UCSC response exceeds byte budget");
    if (!response.body) throw new Error("UCSC response has no body");
    reader = response.body.getReader();
    return await readUcscEvidence(reader, expired, maxBytes, response, url);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}

async function readUcscEvidence(reader: ReadableStreamDefaultReader<Uint8Array<ArrayBufferLike>>, expired: Promise<never>, maxBytes: number, response: Response, url: string) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await Promise.race([reader.read(), expired]);
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) throw new Error("UCSC response exceeds byte budget");
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? "\uFEFF" : "";
  const evidence: UcscText = {
    status: response.status, text: bom + new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    source_url: url, retrieved_at: new Date().toISOString(), body_bytes: size,
    body_sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join(""),
    content_type: response.headers.get("content-type") ?? "", etag: response.headers.get("etag"),
  };
  if ((response.status !== 200 && response.status !== 206) || response.headers.has("content-range")) {
    rejectUcscResponse(`UCSC response is not a supported complete body; received ${response.status}`, evidence);
  }
  return evidence;
}
