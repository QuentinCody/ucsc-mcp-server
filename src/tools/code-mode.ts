import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { ucscCatalog } from "../spec/catalog";
import { createUcscApiFetch } from "../lib/api-adapter";
import { ucscResponse, UCSC_SOURCE } from "../lib/tool-result";

interface CodeModeEnv {
  UCSC_DATA_DO: DurableObjectNamespace;
  CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
  const apiFetch = createUcscApiFetch();
  const registrar = { tool: (...args: unknown[]) => {
    const [name, ...rest] = args;
    const register = server.tool.bind(server) as (...values: unknown[]) => void;
    const handler = rest.pop() as (input: unknown, extra: unknown) => ReturnType<typeof ucscResponse>;
    for (const alias of [String(name), `mcp_${String(name)}`]) register(alias, ...rest,
      (input: unknown, extra: unknown) => ucscResponse(() => handler(input, extra), env, alias, extra, input));
  } };

  const searchTool = createSearchTool({
    prefix: "ucsc",
    catalog: ucscCatalog,
  });
  searchTool.register(registrar);

  const executeTool = createExecuteTool({
    prefix: "ucsc",
    // Verifiable provenance: ucsc_execute results carry a _meta.citation.
    source: UCSC_SOURCE,
    catalog: ucscCatalog,
    apiFetch,
    preserveApiErrors: true,
    maxInlineBytes: 30 * 1024,
    stagingThreshold: 30 * 1024,
    timeout: 90_000,
    doNamespace: env.UCSC_DATA_DO,
    loader: env.CODE_MODE_LOADER,
  });
  executeTool.register(registrar);
}
