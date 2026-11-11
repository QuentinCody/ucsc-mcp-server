import { expect, it } from "vitest";
import { ucscCompleteness } from "./completeness";
import { ucscResponse } from "./tool-result";

it("finds caps through recipe and staging wrappers without inventing a total", () => {
  for (const value of [{ maxItemsLimit: true, itemsReturned: 10 }, { assembly: "hg38", result: { __staged: true, maxItemsLimit: true } }]) {
    expect(ucscCompleteness(value)).toMatchObject({ complete: false, truncation: { reason: "upstream_cap" } });
    expect(ucscCompleteness(value)).not.toHaveProperty("total_available");
  }
});

it("does not turn missing markers or string values into a completeness claim", () => {
  const cycle: Record<string, unknown> = { maxItemsLimit: "true" }; cycle.self = cycle;
  for (const value of [null, [], { maxItemsLimit: false }, { itemsReturned: 10 }, cycle]) expect(ucscCompleteness(value)).toBeUndefined();
});

it("retains a cap when a composed response already has a generic complete flag", async () => {
  const result = await ucscResponse(async () => ({ content: [], structuredContent: {
    success: true, data: { result: { maxItemsLimit: true, itemsReturned: 10 } }, _meta: { completeness: { complete: true } },
  } }), {}, "ucsc_execute", {}, { code: "fixture" });
  expect(result).toMatchObject({ structuredContent: { success: true, _meta: { completeness: { complete: false, truncation: { reason: "upstream_cap" } } } } });
  expect(result.isError).not.toBe(true);
});
