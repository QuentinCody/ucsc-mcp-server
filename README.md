# ucsc-mcp-server

MCP wrapper for the UCSC Genome Browser REST API (`https://api.genome.ucsc.edu`). Covers assembly and GenArk discovery, public hubs, download-file discovery, track/schema metadata, DNA sequence retrieval, track data and text search through Code Mode.

**Upstream API docs:** <https://genome.ucsc.edu/goldenPath/help/api.html>

**Request pacing:** UCSC recommends at most one request per second and uses botDelay for excessive queries. Its current guide does not specify a strict daily cap. Prefer external downloads for bulk work; this wrapper does not coordinate a caller-wide rate limit.

**Coordinate mapping:** this REST API does not expose liftover. UCSC provides separate web/command-line tools; the shared `@bio-mcp/shared/variants/resolve` helper supports Ensembl mapping.

## Tools

- `ucsc_search` — search the endpoint catalog by keyword (returns matching endpoints + docs)
- `ucsc_execute` — run JavaScript in a sandboxed V8 isolate with `api.get()` against the UCSC REST API; auto-stages large responses
- `ucsc_query_data` — SQL over a staged response (`data_access_id` from execute)
- `ucsc_get_schema` — inspect the schema of a staged dataset (or list all staged datasets in this session)

All tools also have `mcp_ucsc_*` aliases. Success and error responses carry both
MCP fields and citations; errors set `isError`. Complete envelopes above the shared
30KiB threshold stage, including composed results and large SQL/schema responses.
The `payloads` table retains the complete response independently of SQL projections.

Requests require a supported GET route, no body and documented parameters. Start
and end must be supplied together with a chromosome. Reads have an 8MiB byte cap,
a 30-second deadline covering headers/body, strict UTF-8 decoding and no redirect
following. HTTP 206 with a native cap marker and returned-row count remains a valid
partial dataset; byte-range fragments and unexplained HTTP 206 fail. Native HTTP
errors retain their bounded body, source URL, byte count and SHA-256. HTTP 200
error pages cannot masquerade as JSON data.

## Example

```js
// api.get returns the provider body or a staging envelope.
return await api.get("/search", { genome: "hg38", search: "BRCA1" });
```

## HPRC v2.1 long-read structural variants

Search for `HPRC` to discover recipes for track `hprc2v21Sv` on `hg38` (GRCh38) and `hs1` (T2T-CHM13). These are separate native-reference callsets from the HPRC minigraph-cactus graph, not lifted copies. The [UCSC track documentation](https://genome.ucsc.edu/cgi-bin/hgTrackUi?db=hg38&g=hprc2v21Sv) describes INS/DEL alleles with net length change of at least 50 bp; it is not a comprehensive inversion callset or a set of independent atomic indels.

```javascript
return await api.get("/list/schema", { genome: "hg38", track: "hprc2v21Sv" });
// In a subsequent call, inspect a bounded region in the same assembly:
// api.get("/getData/track", {
//   genome: "hg38", track: "hprc2v21Sv", chrom: "chr1",
//   start: 1000000, end: 1100000, maxItemsOutput: 100
// });
```

API coordinates are zero-based half-open; browser position strings are one-based closed. Preserve `genome`, track, query interval, download/data timestamps and provider fields. An insertion occupies a one-base anchor: `insLen` gives the inserted length, while `svLen` gives the reference span. Keep `AC`, `alleleNumber`, `alleleFreq`, `nSamples` and `snarlLevel`; cohort frequencies are not clinical classifications, and nested graph alleles need not be independent events. `/list/schema` returns definitions in `columnTypes`.

Always set `maxItemsOutput`: the provider default and maximum are one million, not 1,000. `maxItemsLimit: true` signals partial retrieval (observed with HTTP 206 for track data and HTTP 200 for file listings). The flag remains visible after staging. A staged row count only counts retrieved rows. No offset pagination is documented; split genomic intervals carefully because long SVs can overlap several intervals, or process the provider's bigBed files externally. The [track docs](https://genome.ucsc.edu/cgi-bin/hgTrackUi?db=hg38&g=hprc2v21Sv) link assembly-specific files and `bigBedToBed` usage.

## Additional discovery

- `/findGenome`: search assembly names/accessions, with browser availability and assembly filters.
- `/list/genarkGenomes`: discover assembly hubs or check a versioned accession.
- `/list/publicHubs`: discover public track hubs; use `/list/hubGenomes` and `/list/tracks` to explore them.
- `/list/files`: bounded download-file metadata; optional `format: "text"` returns a text listing.

Sequence queries support `revComp: 1`. Prefer bounded intervals, but 100,000 bp is not a documented hard upstream maximum: a 100,001-base probe succeeded on 2026-09-28. Track queries can opt into `jsonOutputArrays: 1`; otherwise preserve named-field objects.

Staged single-sequence responses expose a `sequence` table. For a long sequence,
read `length(dna)` and use bounded slices such as
`SELECT substr(dna,1,16000) AS dna FROM sequence`, advancing by 16,000 until the
reported length is recovered. A query above the SQL response budget fails without
returning partial rows. Native schema definitions materialize in `schema_fields`;
the full source response retains data timestamps and all additional fields.

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from UCSC Genome Browser API and stays under the terms of that source: Website/API data free for commercial use; liftOver chains non-commercial; some tracks restricted.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
