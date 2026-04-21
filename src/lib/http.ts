import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const UCSC_BASE = "https://api.genome.ucsc.edu";

export interface UcscFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
}

/**
 * Fetch from the UCSC Genome Browser REST API.
 *
 * Rate limit: 10,000 hits/day per IP (upstream-enforced). This wrapper does
 * not enforce the limit — just be polite with retries + long timeouts.
 */
export async function ucscFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: UcscFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? UCSC_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent:
            "ucsc-mcp-server/1.0 (bio-mcp; https://github.com/QuentinCody/ucsc-mcp-server)",
    });
}
