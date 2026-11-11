import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

/**
 * UcscDataDO — Durable Object for staging large UCSC responses.
 *
 * Hint tables for the most common shapes:
 * - /list/ucscGenomes → assemblies (keyed map under "ucscGenomes")
 * - /list/tracks      → tracks      (keyed map under the genome db name)
 * - /list/chromosomes → chromosomes (keyed map under "chromosomes")
 * - /list/schema      → schema_fields (native "columnTypes")
 * - /getData/track    → track_rows  (itemsReturned under a track-named key)
 * - /getData/sequence → sequence    (single row)
 * - /search           → search_matches (flattened out of positionMatches[].matches[])
 *
 * Schema inference handles flat arrays well; for UCSC's keyed-object shapes
 * we rely on the shared staging engine's entity discovery + object-to-rows
 * defaults. Hints below only nudge table naming + indexing.
 */
export class UcscDataDO extends RestStagingDO {
    protected getTabularData(value: unknown): unknown {
        const record = (data: unknown): data is Record<string, unknown> => data !== null && typeof data === "object" && !Array.isArray(data);
        const data = record(value) && Array.isArray(value.content) && record(value.structuredContent) && "data" in value.structuredContent
            ? value.structuredContent.data : value;
        if (!record(data)) return data;
        // The original payload is retained independently by RestStagingDO.
        if (typeof data.sql === "string" && Array.isArray(data.rows)) {
            return { query_rows: data.rows.map((native, row_index) => ({ row_index, native_json: JSON.stringify(native) })) };
        }
        if (typeof data.dna === "string" && typeof data.chrom === "string") return { sequence: [data] };
        return data;
    }

    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        const obj = data as Record<string, unknown>;

        // /list/ucscGenomes → { downloadTime, ucscGenomes: { hg38: {...}, ... } }
        if (obj.ucscGenomes && typeof obj.ucscGenomes === "object") {
            return {
                tableName: "assemblies",
                indexes: ["organism", "scientificName", "sourceName"],
            };
        }

        // /list/chromosomes → { chromCount, chromosomes: { chr1: n, ... } }
        if (obj.chromosomes && typeof obj.chromosomes === "object") {
            return {
                tableName: "chromosomes",
                indexes: [],
            };
        }

        // Native /list/schema uses columnTypes; keep legacy fields compatible.
        if (Array.isArray(obj.columnTypes) || Array.isArray(obj.fields)) {
            return {
                tableName: "schema_fields",
                indexes: ["name", "sqlType"],
            };
        }

        // /getData/sequence → { genome, chrom, start, end, dna }
        if (typeof obj.dna === "string" && typeof obj.chrom === "string") {
            return {
                tableName: "sequence",
                indexes: ["genome", "chrom"],
            };
        }

        // /search → { genome, positionMatches: [ { name, trackName, matches: [...] } ] }
        if (Array.isArray(obj.positionMatches)) {
            return {
                tableName: "search_matches",
                indexes: ["trackName", "name"],
            };
        }

        // /getData/track often returns { genome, track, <trackName>: [rows], itemsReturned }
        // Let the shared engine infer; just hint naming when a rows array is visible at top level.
        if (Array.isArray(data)) {
            const sample = (data as unknown[])[0];
            if (sample && typeof sample === "object") {
                const sampleObj = sample as Record<string, unknown>;
                if ("chrom" in sampleObj && ("chromStart" in sampleObj || "start" in sampleObj)) {
                    return {
                        tableName: "track_rows",
                        indexes: ["chrom", "chromStart", "start", "name"],
                    };
                }
            }
        }

        return undefined;
    }
}
