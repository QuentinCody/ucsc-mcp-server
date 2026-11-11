import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { ucscFetch, rejectUcscResponse } from "./http";
import { ucscRequest } from "./request";
import { ucscCompleteness } from "./completeness";
import { commercialUcscFetch } from "./commercial-profile";

export function createUcscApiFetch(): ApiFetchFn {
  const readUcsc = createUcscRead();
  // License audit 2026-11-10: a reselling caller gets no restricted track and
  // no liftOver chain data (see ./commercial-profile). No change for each other caller.
  return request => (request.licenseProfile === "commercial" ? commercialUcscFetch(request, readUcsc) : readUcsc(request));
}

function createUcscRead(): ApiFetchFn {
  return async request => {
    const url = ucscRequest(request);
    const response = await ucscFetch(url.href);
    if (request.path === "/list/files" && request.params?.format === "text") {
      if (response.status !== 200 || /html|json/i.test(response.content_type)) rejectUcscResponse("UCSC file listing is not complete plain text", response);
      return { status: response.status, data: response.text };
    }
    if (!/^application\/(?:[^;]+\+)?json(?:;|$)/i.test(response.content_type)) rejectUcscResponse("UCSC did not return JSON", response);
    let data: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(response.text);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object");
      data = value as Record<string, unknown>;
    } catch { rejectUcscResponse("UCSC returned malformed JSON or a non-object response", response); }
    if (typeof data.error === "string" && data.error) rejectUcscResponse("UCSC returned an error object", response);
    const completeness = ucscCompleteness(data);
    if (response.status === 206 && !(data.maxItemsLimit === true && Number.isSafeInteger(data.itemsReturned) && Number(data.itemsReturned) >= 0)) {
      rejectUcscResponse("UCSC HTTP 206 lacks a valid native cap marker and returned-row count", response);
    }
    return { status: response.status, data, ...(completeness ? { completeness, upstreamTotal: null } : {}) };
  };
}
