/// <reference types="node" />
import { runInNewContext } from "node:vm";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { afterEach, expect, it, vi } from "vitest";
import { createUcscApiFetch } from "../lib/api-adapter";
import { ucscCatalog } from "./catalog";
import { hprcWorkflows } from "./discovery";

afterEach(() => vi.unstubAllGlobals());

// Small field subsets of live UCSC 2026-09-28 responses for chr1:1000000-1100000.
// These demonstrate that the insertion anchor's span is not its inserted length.
const insertions = {
  hg38: { chrom: "chr1", chromStart: 1016183, chromEnd: 1016184, name: "INS-300:1", svType: "INS", svLen: 1, insLen: 300, AC: 1, alleleNumber: 464, alleleFreq: 0.002155, nSamples: 233, snarlLevel: 0 },
  hs1: { chrom: "chr1", chromStart: 1000179, chromEnd: 1000180, name: "INS-97:350", svType: "INS", svLen: 1, insLen: 97, AC: 350, alleleNumber: 464, alleleFreq: 0.75431, nSamples: 233, snarlLevel: 0 },
};

it.each(["hg38", "hs1"] as const)("runs the %s recipe without losing cohort fields or partial-result evidence", async genome => {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    expect(url.pathname).toBe("/getData/track");
    expect(url.searchParams.get("genome")).toBe(genome);
    expect(url.searchParams.get("track")).toBe("hprc2v21Sv");
    expect(url.searchParams.get("maxItemsOutput")).toBe("100");
    return Response.json({ genome, hprc2v21Sv: [insertions[genome]], itemsReturned: 1, maxItemsLimit: true }, { status: 206 });
  });
  vi.stubGlobal("fetch", fetcher);
  const proxy = createApiProxyTool({ catalog: ucscCatalog, apiFetch: createUcscApiFetch() });
  const api = { get: (path: string, params: Record<string, unknown>) => proxy.handler({ method: "GET", path, params }, { sql: () => [] }) };
  const recipe = hprcWorkflows.find(item => item.title.endsWith(`on ${genome}`));
  const result = await runInNewContext(`(async()=>{${recipe?.code}})()`, { api });
  expect(result).toMatchObject({ assembly: genome, track: "hprc2v21Sv", result: { itemsReturned: 1, maxItemsLimit: true, hprc2v21Sv: [insertions[genome]] } });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("preserves the upstream limit warning when all returned rows are staged", async () => {
  // Repeated rows are a staging-size fixture, not a claim of distinct biological alleles.
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ genome: "hg38", track: "hprc2v21Sv", hprc2v21Sv: Array(200).fill(insertions.hg38), itemsReturned: 200, maxItemsLimit: true }, { status: 206 })));
  const stage = vi.fn(async (request: Request) => {
    if (new URL(request.url).pathname === "/process") return Response.json({ success: true, tables_created: ["hprc2v21Sv"], total_rows: 200, input_rows: 200, table_row_counts: { hprc2v21Sv: 200 } });
    return Response.json({ success: true, schema: { tables: { hprc2v21Sv: { columns: [] } } } });
  });
  // SAFETY: this fixture supplies exactly the namespace/stub methods used by staging.
  const namespace = { idFromName: (name: string) => name, get: () => ({ fetch: stage }) } as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({ catalog: ucscCatalog, apiFetch: createUcscApiFetch(), doNamespace: namespace, stagingPrefix: "ucsc" });
  const result = await proxy.handler({ method: "GET", path: "/getData/track", params: { genome: "hg38", track: "hprc2v21Sv", maxItemsOutput: 200 } }, { sql: () => [] });
  expect(result).toMatchObject({ __staged: true, genome: "hg38", track: "hprc2v21Sv", itemsReturned: 200, maxItemsLimit: true });
  expect(result).toMatchObject({ _staging: { completeness: { complete: false, truncation: { reason: "upstream_cap" } } } });
  expect(JSON.stringify(result).length).toBeLessThan(100_000);
  expect(stage).toHaveBeenCalled();
});

it("executes the schema recipe and retains columnTypes and the provider data timestamp", async () => {
  const schema = { genome: "hg38", track: "hprc2v21Sv", dataTime: "2026-06-13T15:49:05", columnTypes: [{ name: "insLen", sqlType: "int", jsonType: "number", description: "Insertion Length|Length of inserted sequence, 0 for DEL" }] };
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    expect(new URL(String(input)).pathname).toBe("/list/schema");
    return Response.json(schema);
  }));
  const proxy = createApiProxyTool({ catalog: ucscCatalog, apiFetch: createUcscApiFetch() });
  const api = { get: (path: string, params: Record<string, unknown>) => proxy.handler({ method: "GET", path, params }, { sql: () => [] }) };
  const result = await runInNewContext(`(async()=>{${hprcWorkflows[2].code}})()`, { api });
  expect(result).toEqual(schema);
});
