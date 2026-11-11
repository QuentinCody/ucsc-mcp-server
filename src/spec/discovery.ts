import type { ApiEndpoint, ParamDef, WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";

const maxItems: ParamDef = { name: "maxItemsOutput", type: "number", required: false,
  description: "Explicit output cap; provider default/maximum is 1,000,000. Use a small bound and retain any maxItemsLimit warning." };

export const discoveryEndpoints: ApiEndpoint[] = [
  { method: "GET", path: "/findGenome", category: "genomes",
    summary: "Find UCSC/NCBI assemblies by text or accession, including assemblies not yet in the browser",
    queryParams: [
      { name: "q", type: "string", required: true, description: "Case-insensitive query, e.g. GRCh38 or GCF_028858775.2; +required, -excluded and trailing * wildcard terms supported" },
      { name: "browser", type: "string", required: false, description: "mustExist (default), mayExist or notExist" },
      { name: "statsOnly", type: "number", required: false, description: "1 returns search statistics only" },
      { name: "year", type: "number", required: false, description: "Assembly year filter" },
      { name: "category", type: "string", required: false, description: "NCBI category: reference or representative" },
      { name: "status", type: "string", required: false, description: "NCBI status: reference or representative" },
      { name: "level", type: "string", required: false, description: "Assembly level: complete, chromosome, scaffold or contig" }, maxItems,
    ] },
  { method: "GET", path: "/list/publicHubs", category: "tracks", summary: "Discover public track hubs and their metadata; pass the selected hub URL to hubGenomes/tracks" },
  { method: "GET", path: "/list/genarkGenomes", category: "genomes", summary: "Discover GenArk assembly hubs or check a particular versioned assembly accession",
    queryParams: [{ name: "genome", type: "string", required: false, description: "Versioned assembly accession, e.g. GCF_028858775.2" }, maxItems] },
  { method: "GET", path: "/list/files", category: "genomes", summary: "Discover UCSC-hosted assembly download files for external bulk processing",
    queryParams: [{ name: "genome", type: "string", required: true, description: "UCSC-hosted assembly such as hs1; not an arbitrary external hub" },
      { name: "format", type: "string", required: false, description: "Omit for JSON metadata; text returns a plain-text listing" }, maxItems] },
];

export const hprcWorkflows: WorkflowRecipe[] = [
  ...["hg38", "hs1"].map(genome => ({
    title: `HPRC v2.1 long-read structural variants on ${genome}`,
    description: "Bounded native-reference INS/DEL example. Coordinates on hg38 and hs1 describe different loci, not a liftover or matched-variant comparison. Preserve allele denominators and graph nesting.",
    keywords: ["HPRC", "v2.1", "pangenome", "long-read", "structural", "SV", genome, "hprc2v21Sv"],
    code: `const result = await api.get("/getData/track", {genome:"${genome}", track:"hprc2v21Sv", chrom:"chr1", start:1000000, end:1100000, maxItemsOutput:100});
return {assembly:"${genome}", track:"hprc2v21Sv", coordinates:"0-based half-open", result,
  interpretation:"INS chromEnd-chromStart is a one-base anchor; use insLen for inserted bases. DEL spans reference bases. AC/alleleNumber/alleleFreq and nSamples are provider cohort values, not clinical pathogenicity. Retain snarlLevel; nested alleles are not independent events. maxItemsLimit=true means partial results, including after staging."};`,
  })),
  { title: "Inspect HPRC v2.1 score and coordinate fields", description: "Read the current field definitions and UCSC data timestamp before interpreting hprc2v21Sv rows; use genome hs1 for the other native callset.",
    keywords: ["HPRC", "v2.1", "schema", "allele", "frequency", "snarl", "hprc2v21Sv"],
    code: 'return await api.get("/list/schema", {genome:"hg38", track:"hprc2v21Sv"});' },
];
