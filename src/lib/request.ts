import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { ucscCatalog } from "../spec/catalog";

/** Validate the documented read surface without silently changing caller parameters. */
export function ucscRequest(request: Parameters<ApiFetchFn>[0]): URL {
  if (request.method !== "GET" || request.body !== undefined) throw new Error("UCSC requires GET without a body");
  const endpoint = ucscCatalog.endpoints.find(item => item.path === request.path && item.method === "GET");
  if (!endpoint) throw new Error("Unsupported UCSC API route");
  const params = request.params ?? {};
  const definitions = endpoint.queryParams ?? [];
  for (const key of Object.keys(params)) {
    const definition = definitions.find(item => item.name === key);
    if (!definition) throw new Error(`Unsupported UCSC parameter: ${key}`);
    const value = params[key];
    if (definition.type === "number") {
      if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${key} requires a safe integer`);
    } else if (typeof value !== "string" || !value.trim() || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error(`${key} requires nonempty text without control characters`);
  }
  for (const definition of definitions) {
    if (definition.required && params[definition.name] === undefined) throw new Error(`Missing UCSC parameter: ${definition.name}`);
  }
  if ((params.start === undefined) !== (params.end === undefined)) throw new Error("Supply start and end together");
  if (params.start !== undefined && (!params.chrom || Number(params.start) < 0 || Number(params.end) < Number(params.start))) throw new Error("Coordinates require chrom and 0 <= start <= end");
  const cap = params.maxItemsOutput;
  if (cap !== undefined && cap !== -1 && (Number(cap) < 1 || Number(cap) > 1_000_000)) throw new Error("maxItemsOutput must be -1 or 1 through 1000000");
  for (const key of ["revComp", "jsonOutputArrays", "trackLeavesOnly", "statsOnly"]) {
    if (params[key] !== undefined && params[key] !== 0 && params[key] !== 1) throw new Error(`${key} must be 0 or 1`);
  }
  if (params.format !== undefined && params.format !== "text") throw new Error("Use format=text or omit format for JSON");
  const url = new URL(request.path, "https://api.genome.ucsc.edu");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url;
}
