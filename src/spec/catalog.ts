/**
 * UCSC Genome Browser REST API catalog.
 *
 * Upstream: https://api.genome.ucsc.edu
 * Docs:     https://genome.ucsc.edu/goldenPath/help/api.html
 *
 * Covers assembly metadata, track listings, track schemas, DNA sequence
 * retrieval, track data, and text search. See notes below for the hard
 * pacing guidance and omission of liftover (not exposed by this REST API).
 */

import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";
import { discoveryEndpoints, hprcWorkflows } from "./discovery";

export const ucscCatalog: ApiCatalog = {
    name: "UCSC Genome Browser API",
    baseUrl: "https://api.genome.ucsc.edu",
    version: "unversioned API; native assembly and data metadata retained",
    auth: "none",
    endpointCount: 8 + discoveryEndpoints.length,
    notes:
        "- UCSC recommends at most one request per second; botDelay may slow excessive queries. Current docs do not specify a strict daily query limit. Prefer download files for bulk workloads.\n" +
        "- This UCSC REST API does not expose liftover; UCSC offers separate web/command-line tools. For Ensembl mapping use @bio-mcp/shared/variants/resolve.\n" +
        "- Responses default to JSON; /list/files also supports format=text. Arrays/maps are returned under keyed objects — e.g. /list/ucscGenomes returns { ucscGenomes: { hg38: {...}, hg19: {...} } }, not a top-level array.\n" +
        "- GET-only with documented parameters; reads are bounded to 8MiB and 30 seconds including the body. Native capped HTTP 206 JSON requires maxItemsLimit=true and itemsReturned. Byte-range fragments, redirects and malformed responses fail explicitly.\n" +
        "- Assemblies are keyed by UCSC database name (e.g. hg38, hg19, mm10, mm39, dm6, danRer11, sacCer3). Use /list/ucscGenomes to enumerate.\n" +
        "- Track hubs are external — pass hubUrl query param to access their assemblies and tracks.\n" +
        "- Pass query parameters through api.get's parameter map; the service accepts '&' and documents ';' separators.\n" +
        "- Prefer bounded sequence intervals (for example 100,000 bp). This is a practical recommendation, not a documented upstream hard cap.\n" +
        "- /getData/track maxItemsOutput defaults to 1,000,000, also the provider maximum. Always set a small explicit cap. HTTP 206 or maxItemsLimit=true indicates partial data; staging all returned rows does not make the query complete. No offset pagination is documented. Split ranges carefully (overlapping SVs may recur) or use bigBed downloads externally.\n" +
        "- API coordinates are 0-based half-open (BED-style); browser position strings are 1-based closed.\n" +
        "- HPRC v2.1 track hprc2v21Sv is available natively on hg38 and hs1. Use the HPRC workflows and /list/schema columnTypes. These graph-derived INS/DEL alleles are not lifted copies or wave-decomposed atomic variants; insertion anchors have span 1, with inserted length in insLen. Retain snarlLevel and cohort allele denominators.",
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
                "Return the column schema for a single track. Shows columnTypes (name, sqlType, jsonType, description) and data timestamp — essential for interpreting /getData/track responses, including HPRC hprc2v21Sv.",
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
                "Retrieve raw DNA sequence for a genomic region. Returns { dna, chrom, start, end, genome }. Prefer small bounded intervals; long responses stage automatically.",
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
                    required: false,
                    description: "0-based start coordinate (inclusive, BED-style); supply start/end together",
                },
                {
                    name: "end",
                    type: "number",
                    required: false,
                    description: "0-based end coordinate (exclusive, BED-style); supply start/end together",
                },
                {
                    name: "revComp",
                    type: "number",
                    required: false,
                    description: "1 returns the reverse complement",
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
                "Retrieve annotations from a track over a genomic range, including HPRC v2.1 SVs with track=hprc2v21Sv on hg38 or hs1. Returns rows under the track name; preserve maxItemsLimit and itemsReturned, and read /list/schema first.",
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
                    description: "Cap returned rows explicitly; upstream default and maximum 1,000,000. maxItemsLimit=true marks a partial result.",
                },
                {
                    name: "jsonOutputArrays",
                    type: "number",
                    required: false,
                    description: "1 returns row arrays with columnTypes; omit for named-field row objects",
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
                "Text search within one genome assembly — looks up gene symbols, transcript IDs, HGNC IDs, cytogenetic bands, and UCSC accessions. Returns { positionMatches: [{ name, trackName, matches: [{ position, posName, description }] }] }.",
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
                    description: "Restrict to helpDocs, publicHubs or trackDb",
                },
            ],
        },
        ...discoveryEndpoints,
    ],
    workflows: hprcWorkflows,
};
