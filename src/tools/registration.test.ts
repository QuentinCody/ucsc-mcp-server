import {afterEach, expect, it, vi} from "vitest";
import {McpServer} from "@bio-mcp/shared/mcp";
import {registerCodeMode} from "./code-mode";
import {registerGetSchema} from "./get-schema";
import {registerQueryData} from "./query-data";
import {ucscCatalog} from "../spec/catalog";

afterEach(() => vi.unstubAllGlobals());

it("registers both aliases and returns both fields for discovery and errors", async () => {
  const server = new McpServer({name: "fixture", version: "1"});
  // SAFETY: no isolate runs in this registration test; the loader is only constructed.
  registerCodeMode(server, {CODE_MODE_LOADER: {get: () => ({})}} as unknown as Parameters<typeof registerCodeMode>[1]);
  registerGetSchema(server, {}); registerQueryData(server, {});
  // SAFETY: SDK private registry is inspected only in tests to exercise the real handlers.
  const tools = (server as unknown as {_registeredTools: Record<string, {handler: (args: unknown, extra: unknown) => Promise<unknown>}>})._registeredTools;
  for (const suffix of ["search", "execute", "query_data", "get_schema"]) {
    expect(tools[`ucsc_${suffix}`]).toBeDefined(); expect(tools[`mcp_ucsc_${suffix}`]).toBeDefined();
  }
  for (const prefix of ["ucsc", "mcp_ucsc"]) {
    expect(await tools[`${prefix}_search`].handler({query: "HPRC", max_results: 5}, {})).toMatchObject({content: expect.any(Array), structuredContent: {success: true}});
    expect(await tools[`${prefix}_execute`].handler({code: ""}, {})).toMatchObject({isError: true, content: expect.any(Array), structuredContent: expect.any(Object)});
    expect(await tools[`${prefix}_query_data`].handler({data_access_id: "fixture", sql: "SELECT 1"}, {})).toMatchObject({isError: true, content: expect.any(Array), structuredContent: expect.any(Object)});
  }
  expect(ucscCatalog.endpointCount).toBe(ucscCatalog.endpoints.length);
});
