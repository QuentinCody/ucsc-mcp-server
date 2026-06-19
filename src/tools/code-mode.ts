/**
 * UCSC Code Mode — registers ucsc_search + ucsc_execute for full API access.
 *
 * search:  In-process catalog query, returns matching endpoints with docs.
 * execute: V8 isolate with api.get/api.post + searchSpec/listCategories.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { ucscCatalog } from "../spec/catalog";
import { createUcscApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
    UCSC_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
    const apiFetch = createUcscApiFetch();

    const searchTool = createSearchTool({
        prefix: "ucsc",
        catalog: ucscCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "ucsc",
        // Verifiable provenance: ucsc_execute results carry a _meta.citation.
        source: { id: "ucsc", name: "UCSC Genome Browser", url: "https://genome.ucsc.edu" },
        catalog: ucscCatalog,
        apiFetch,
        doNamespace: env.UCSC_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
