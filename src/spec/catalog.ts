/**
 * UCSC Genome Browser REST API catalog.
 *
 * Upstream: https://api.genome.ucsc.edu
 * Docs:     https://genome.ucsc.edu/goldenPath/help/api.html
 *
 * Covers assembly metadata, track listings, track schemas, DNA sequence
 * retrieval, track data, and text search. See notes below for the hard
 * rate limit and the deliberate omission of liftover (not exposed by REST).
 */

import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const ucscCatalog: ApiCatalog = {
    name: "UCSC Genome Browser API",
    baseUrl: "https://api.genome.ucsc.edu",
    version: "1.0",
    auth: "none",
    endpointCount: 8,
    notes:
        "- UCSC API rate limit is 10,000 hits/day per IP (upstream-enforced). Long loops in Code Mode can exhaust the budget — batch queries where possible.\n" +
        "- UCSC REST does NOT expose liftover — that is hgLiftOver on the web UI only. For liftover, use Ensembl via the shared helper @bio-mcp/shared/variants/resolve.\n" +
        "- All responses are JSON. Arrays are returned under keyed objects — e.g. /list/ucscGenomes returns { ucscGenomes: { hg38: {...}, hg19: {...} } }, not a top-level array.\n" +
        "- Assemblies are keyed by UCSC database name (e.g. hg38, hg19, mm10, mm39, dm6, danRer11, sacCer3). Use /list/ucscGenomes to enumerate.\n" +
        "- Track hubs are external — pass hubUrl query param to access their assemblies and tracks.\n" +
        "- /search separates multiple params with ';' (semicolons), not '&'. Example: /search?genome=hg38;search=BRCA1.\n" +
        "- /getData/sequence has a hard range cap: end - start must be <= 100,000 bp. For larger ranges, chunk the request or stage via SQL.\n" +
        "- /getData/track supports maxItemsOutput (default 1000). For whole-genome dumps, chunk by chromosome.\n" +
        "- Coordinates are 0-based half-open (BED-style), same as the UCSC Genome Browser.",
    endpoints: [
        // === Genomes ===
        {
            method: "GET",
            path: "/list/ucscGenomes",
            summary:
                "List all UCSC-hosted genome assemblies with metadata (organism, scientificName, description, sourceName, defaultPos, nibPath). Response shape: { ucscGenomes: { <db>: {...}, ... } }.",
            category: "genomes",
        },
        {
            method: "GET",
            path: "/list/hubGenomes",
            summary:
                "List the genome assemblies registered in a public or private track hub. Useful for hub-hosted (non-UCSC-native) assemblies.",
            category: "genomes",
            queryParams: [
                {
                    name: "hubUrl",
                    type: "string",
                    required: true,
                    description:
                        "URL to the track hub's hub.txt manifest (e.g. https://hgdownload.soe.ucsc.edu/hubs/GCA/003/254/395/GCA_003254395.2/hub.txt)",
                },
            ],
        },
        {
            method: "GET",
            path: "/list/chromosomes",
            summary:
                "List chromosomes and their sizes for one assembly. Returns { chromCount, chromosomes: { chr1: <bp>, ... } }. Handy as a pre-flight before /getData requests.",
            category: "genomes",
            queryParams: [
                {
                    name: "genome",
                    type: "string",
                    required: true,
                    description: "UCSC database name (e.g. hg38, hg19, mm39, dm6)",
                },
                {
                    name: "hubUrl",
                    type: "string",
                    required: false,
                    description: "Optional track-hub URL when listing chromosomes for hub-hosted assemblies",
                },
                {
                    name: "track",
                    type: "string",
                    required: false,
                    description: "Optional track name to scope the chromosome list (e.g. for hub assemblies)",
                },
            ],
        },

        // === Tracks ===
        {
            method: "GET",
            path: "/list/tracks",
            summary:
                "List all tracks available for one genome assembly, grouped by track type. Includes track name, shortLabel, longLabel, type, group, and parent relationships. Large payload for well-annotated assemblies (hg38 can exceed 200 KB).",
            category: "tracks",
            queryParams: [
                {
                    name: "genome",
                    type: "string",
                    required: true,
                    description: "UCSC database name (e.g. hg38)",
                },
                {
                    name: "hubUrl",
                    type: "string",
                    required: false,
                    description: "Optional hub URL for hub-hosted tracks",
                },
                {
                    name: "trackLeavesOnly",
                    type: "number",
                    required: false,
                    description: "When 1, collapse composite/super-tracks and only emit leaf tracks",
                },
            ],
        },

        // === Schema ===
        {
            method: "GET",
            path: "/list/schema",
            summary:
                "Return the column schema for a single track. Shows fieldCount, fields (name, sqlType, description) — essential for interpreting /getData/track responses.",
            category: "schema",
            queryParams: [
                {
                    name: "genome",
                    type: "string",
                    required: true,
                    description: "UCSC database name (e.g. hg38)",
                },
                {
                    name: "track",
                    type: "string",
                    required: true,
                    description: "Track name (from /list/tracks). Example: knownGene, snp151, gnomAD_v3_1_1_Constraint",
                },
                {
                    name: "hubUrl",
                    type: "string",
                    required: false,
                    description: "Optional hub URL when the track is hub-hosted",
                },
            ],
        },

        // === Sequence ===
        {
            method: "GET",
            path: "/getData/sequence",
            summary:
                "Retrieve raw DNA sequence for a genomic region. Returns { dna, chrom, start, end, genome }. Hard range cap: end - start MUST be <= 100,000 bp (upstream rejects larger requests). For larger ranges, chunk by sub-region.",
            category: "sequence",
            queryParams: [
                {
                    name: "genome",
                    type: "string",
                    required: true,
                    description: "UCSC database name (e.g. hg38)",
                },
                {
                    name: "chrom",
                    type: "string",
                    required: true,
                    description: "Chromosome name (e.g. chr17, chrX, chrM)",
                },
                {
                    name: "start",
                    type: "number",
                    required: true,
                    description: "0-based start coordinate (inclusive, BED-style)",
                },
                {
                    name: "end",
                    type: "number",
                    required: true,
                    description: "0-based end coordinate (exclusive, BED-style). Must satisfy end - start <= 100_000.",
                },
                {
                    name: "hubUrl",
                    type: "string",
                    required: false,
                    description: "Optional hub URL for hub-hosted assemblies",
                },
            ],
        },

        // === Track Data ===
        {
            method: "GET",
            path: "/getData/track",
            summary:
                "Retrieve annotations from a single track over a genomic range. Returns the track rows using the schema from /list/schema. For genome-wide dumps, chunk by chromosome and tune maxItemsOutput.",
            category: "trackdata",
            queryParams: [
                {
                    name: "genome",
                    type: "string",
                    required: true,
                    description: "UCSC database name (e.g. hg38)",
                },
                {
                    name: "track",
                    type: "string",
                    required: true,
                    description: "Track name (see /list/tracks)",
                },
                {
                    name: "chrom",
                    type: "string",
                    required: false,
                    description: "Chromosome name. If omitted, returns data across all chromosomes up to maxItemsOutput.",
                },
                {
                    name: "start",
                    type: "number",
                    required: false,
                    description: "0-based start coordinate (requires chrom)",
                },
                {
                    name: "end",
                    type: "number",
                    required: false,
                    description: "0-based end coordinate (requires chrom)",
                },
                {
                    name: "maxItemsOutput",
                    type: "number",
                    required: false,
                    description: "Cap the number of rows returned (default 1000, max is upstream-enforced)",
                },
                {
                    name: "hubUrl",
                    type: "string",
                    required: false,
                    description: "Optional hub URL for hub-hosted tracks",
                },
            ],
        },

        // === Search ===
        {
            method: "GET",
            path: "/search",
            summary:
                "Text search within one genome assembly — looks up gene symbols, transcript IDs, HGNC IDs, cytogenetic bands, and UCSC accessions. Returns { positionMatches: [{ name, trackName, matches: [{ position, posName, description }] }] }. NOTE: upstream uses ';' (semicolon) as the query-string separator (e.g. /search?genome=hg38;search=BRCA1); api.get() handles this automatically from the params map.",
            category: "search",
            queryParams: [
                {
                    name: "genome",
                    type: "string",
                    required: true,
                    description: "UCSC database name to search within (e.g. hg38)",
                },
                {
                    name: "search",
                    type: "string",
                    required: true,
                    description: "Free-text query — gene symbol, transcript ID, HGNC ID, cytoband, or RefSeq accession",
                },
                {
                    name: "categories",
                    type: "string",
                    required: false,
                    description: "Optional comma-separated list of track categories to restrict the search",
                },
                {
                    name: "hubUrl",
                    type: "string",
                    required: false,
                    description: "Optional hub URL for hub-hosted assemblies",
                },
            ],
        },
    ],
};
