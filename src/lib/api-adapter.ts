/**
 * UCSC API adapter — wraps ucscFetch into the ApiFetchFn interface
 * for use by the Code Mode __api_proxy tool.
 *
 * UCSC REST returns JSON for all documented endpoints; no special
 * content-type switching needed. Upstream enforces 10,000 hits/day/IP.
 */

import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { ucscFetch } from "./http";

export function createUcscApiFetch(): ApiFetchFn {
    return async (request) => {
        const response = await ucscFetch(
            request.path,
            request.params as Record<string, unknown>,
        );

        if (!response.ok) {
            let errorBody: string;
            try {
                errorBody = await response.text();
            } catch {
                errorBody = response.statusText;
            }
            const error = new Error(
                `HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
            ) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            const text = await response.text();
            return { status: response.status, data: text };
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}
