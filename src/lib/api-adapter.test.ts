import { afterEach, expect, it, vi } from "vitest";
import { createUcscApiFetch } from "./api-adapter";
import { ucscRequest } from "./request";
const api = createUcscApiFetch();
afterEach(() => vi.unstubAllGlobals());

it.each([
  { method: "POST", path: "/getData/track", params: { genome: "hg38", track: "hprc2v21Sv" } },
  { method: "GET", path: "/list/ucscGenomes", body: {} },
  { method: "GET", path: "https://example.org/list/ucscGenomes" },
  { method: "GET", path: "/list/ucscGenomes?injected=1" },
  { method: "GET", path: "/list/ucscGenomes", params: { unexpected: 1 } },
  { method: "GET", path: "/list/schema", params: { genome: "hg38" } },
  { method: "GET", path: "/findGenome", params: { q: "" } },
  { method: "GET", path: "/findGenome", params: { q: ["hg38"] } },
  { method: "GET", path: "/findGenome", params: { q: "bad\nquery" } },
  ...[0, 1_000_001, 1.5, "100", Number.NaN, Number.POSITIVE_INFINITY].map(maxItemsOutput => ({ method: "GET", path: "/list/genarkGenomes", params: { maxItemsOutput } })),
  ...[{ start: 1 }, { start: -1, end: 2 }, { start: 5, end: 4 }, { start: 0, end: 9_007_199_254_740_992 }, { revComp: 2 }].map(params => ({ method: "GET", path: "/getData/sequence", params: { genome: "hg38", chrom: "chr1", ...params } })),
  { method: "GET", path: "/getData/track", params: { genome: "hg38", track: "hprc2v21Sv", start: 1, end: 2 } },
  { method: "GET", path: "/list/files", params: { genome: "hs1", format: "html" } },
])("rejects unsupported requests without a provider read: %j", async request => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(api(request)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
});

it("encodes literal query syntax once and preserves documented flags and hub values", () => {
  const q = "+white +rhino* -southern &x=1";
  const url = ucscRequest({ method: "GET", path: "/findGenome", params: { q, statsOnly: 0, maxItemsOutput: -1 } });
  expect(url.origin).toBe("https://api.genome.ucsc.edu");
  expect([...url.searchParams.keys()]).toEqual(["q", "statsOnly", "maxItemsOutput"]);
  expect(url.searchParams.get("q")).toBe(q);
  const hub = "https://example.org/hub.txt?version=2&name=a+b";
  expect(ucscRequest({ method: "GET", path: "/list/hubGenomes", params: { hubUrl: hub } }).searchParams.get("hubUrl")).toBe(hub);
});

it.each([200, 206])("keeps native capped JSON intact at status %i", async status => {
  const data = { genome: "hg38", hprc2v21Sv: [{ chromStart: 1016183, chromEnd: 1016184, insLen: 300, alleleNumber: 464 }], itemsReturned: 1, maxItemsLimit: true };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data, { status })));
  const result = await api({ method: "GET", path: "/getData/track", params: { genome: "hg38", track: "hprc2v21Sv", maxItemsOutput: 1 } });
  expect(result.data).toEqual(data);
  expect(result).toMatchObject({ status, upstreamTotal: null, completeness: { complete: false, truncation: { reason: "upstream_cap" } } });
});

it.each([{ itemsReturned: 1 }, { maxItemsLimit: false, itemsReturned: 1 }, { maxItemsLimit: true, itemsReturned: -1 }, { maxItemsLimit: true, itemsReturned: "1" }])("rejects unexplained HTTP 206: %j", async data => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data, { status: 206 })));
  await expect(api({ method: "GET", path: "/list/ucscGenomes" })).rejects.toMatchObject({ status: 502, data: { status: 206, text: JSON.stringify(data) } });
});

it.each(["<html>error</html>", "{broken", "[]", "null", '{"error":"Unknown genome"}'])("rejects malformed/false-success JSON without losing its body", async text => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(text, { headers: { "content-type": "application/json" } })));
  await expect(api({ method: "GET", path: "/list/ucscGenomes" })).rejects.toMatchObject({ status: 502, data: { text, body_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } });
});

it("rejects HTML success for JSON reads, and byte-range fragments even when a native cap exists", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("<html>unavailable</html>"))
    .mockResolvedValueOnce(Response.json({ maxItemsLimit: true, itemsReturned: 1 }, { status: 206, headers: { "content-range": "bytes 0-40/1000" } })));
  for (let n = 0; n < 2; n++) await expect(api({ method: "GET", path: "/list/ucscGenomes" })).rejects.toMatchObject({ status: 502 });
});

it("keeps positional arrays and explicit plain-text file listings", async () => {
  const data = { columnTypes: [{ name: "chrom", jsonType: "string" }], itemsReturned: 2, track: [["chr1"], ["chr2"]] };
  const raw = "\uFEFF# source α\r\nfile.txt\r\n";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(data)).mockResolvedValueOnce(new Response(raw)));
  expect((await api({ method: "GET", path: "/getData/track", params: { genome: "hg38", track: "track", jsonOutputArrays: 1 } })).data).toEqual(data);
  expect((await api({ method: "GET", path: "/list/files", params: { genome: "hs1", format: "text" } })).data).toBe(raw);
});
