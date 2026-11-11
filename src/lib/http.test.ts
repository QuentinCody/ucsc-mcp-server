import { afterEach, expect, it, vi } from "vitest";
import { ucscFetch } from "./http";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const url = "https://api.genome.ucsc.edu/list/ucscGenomes";

it("hashes original UTF-8 bytes and keeps text, URL and source headers", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("α😀", { headers: { etag: '"fixture"' } }));
  vi.stubGlobal("fetch", fetcher);
  const result = await ucscFetch(url);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("α😀"));
  expect(result).toMatchObject({ text: "α😀", body_bytes: 6, source_url: url, etag: '"fixture"',
    body_sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("") });
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "manual" });
});

it.each([302, 404, 503])("preserves complete native error bodies for HTTP %i", async status => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("native error α", { status })));
  await expect(ucscFetch(url)).rejects.toMatchObject({ status, data: { status, text: "native error α", source_url: url, body_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } });
});

it("rejects Content-Range even on HTTP 200", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("part", { headers: { "content-range": "bytes 0-3/100" } })));
  await expect(ucscFetch(url)).rejects.toMatchObject({ status: 502, data: { text: "part" } });
});

it.each([true, false])("bounds bodies with or without a Content-Length declaration (%s)", async declared => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("α".repeat(10), { headers: declared ? { "content-length": "20" } : {} })));
  await expect(ucscFetch(url, 19)).rejects.toThrow("byte budget");
});

it("rejects malformed UTF-8 and missing bodies", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([0xc0, 0xaf]))).mockResolvedValueOnce(new Response(null)));
  await expect(ucscFetch(url)).rejects.toThrow();
  await expect(ucscFetch(url)).rejects.toThrow("no body");
});

it("preserves a UTF-8 BOM and multibyte characters across separate chunks", async () => {
  const bytes = new TextEncoder().encode("\uFEFFα😀\r\n");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } }))));
  const result = await ucscFetch(url);
  expect(new TextEncoder().encode(result.text)).toEqual(bytes);
  expect(result.body_bytes).toBe(bytes.length);
});

it.each(["headers", "body"])("enforces a deadline while waiting for %s", async phase => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ cancel }));
  const fetcher = vi.fn().mockImplementation(() => phase === "headers" ? new Promise(() => {}) : Promise.resolve(response));
  vi.stubGlobal("fetch", fetcher);
  const request = expect(ucscFetch(url, 100, 50)).rejects.toThrow("deadline");
  await vi.advanceTimersByTimeAsync(51);
  await request;
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  if (phase === "body") expect(cancel).toHaveBeenCalled();
});
