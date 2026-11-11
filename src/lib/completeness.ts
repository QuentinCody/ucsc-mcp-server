import type { Completeness } from "@bio-mcp/shared";

/** Carry a native cap through composed recipes without replacing upstream totals. */
export function ucscCompleteness(value: unknown): Completeness | undefined {
  const pending: unknown[] = [value];
  const visited = new Set<object>();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    const record = current as Record<string, unknown>;
    if (record.maxItemsLimit === true) return { complete: false,
      truncation: { reason: "upstream_cap", detail: "UCSC maxItemsLimit marks a capped response. Staging preserves only the rows returned by that request.",
        remedy: "Use smaller genomic windows while accounting for overlapping features, or obtain the provider's bulk files. No offset pagination is documented." } };
    for (const child of Object.values(record)) if (child && typeof child === "object") pending.push(child);
  }
  return undefined;
}
