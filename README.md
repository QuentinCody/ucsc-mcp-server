# ucsc-mcp-server

MCP wrapper for the UCSC Genome Browser REST API (`https://api.genome.ucsc.edu`). Covers assembly/track/schema metadata, DNA sequence retrieval, track data pulls, and text search. Code Mode only — 4 tools cover every documented endpoint.

**Upstream API docs:** <https://genome.ucsc.edu/goldenPath/help/api.html>

**Rate limit:** 10,000 hits/day per IP (upstream-enforced). Batch queries in Code Mode loops.

**Out of scope:** UCSC REST does NOT expose liftover — that is `hgLiftOver` on the web UI only. Use Ensembl via `@bio-mcp/shared/variants/resolve` for liftover.

## Tools

- `ucsc_search` — search the endpoint catalog by keyword (returns matching endpoints + docs)
- `ucsc_execute` — run JavaScript in a sandboxed V8 isolate with `api.get()` / `api.post()` against the UCSC REST API; auto-stages responses >30 KB
- `ucsc_query_data` — SQL over a staged response (`data_access_id` from execute)
- `ucsc_get_schema` — inspect the schema of a staged dataset (or list all staged datasets in this session)

## Example

```js
// Via ucsc_execute — smoke test from plan §5.6
const { data } = await api.get('/search', { genome: 'hg38', search: 'BRCA1' });
return data.positionMatches;
```
