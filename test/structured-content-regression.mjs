#!/usr/bin/env node

/**
 * Regression tests for ucsc-mcp-server structuredContent responses.
 *
 * Validates the Code Mode-only file layout (search + execute + query_data + get_schema)
 * and surfaces key catalog/DO invariants before the wrangler build step runs.
 *
 * Smoke-test query for manual verification (from the biomni gap-closure plan §5.6):
 *   ucsc_search({ query: "BRCA1 hg38" })
 * Code Mode writes: api.get('/search', { genome: 'hg38', search: 'BRCA1' })
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertContains(filePath, haystack, needle, testName) {
  totalTests++;
  if (haystack.includes(needle)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Missing: ${needle}`);
    console.log(`  File: ${filePath}`);
    failedTests++;
  }
}

function assertNotContains(filePath, haystack, needle, testName) {
  totalTests++;
  if (!haystack.includes(needle)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Should not contain: ${needle}`);
    console.log(`  File: ${filePath}`);
    failedTests++;
  }
}

function assertFileExists(relPath, testName) {
  totalTests++;
  const fullPath = path.join(SERVER_ROOT, relPath);
  if (fs.existsSync(fullPath)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
    return fs.readFileSync(fullPath, 'utf-8');
  }
  console.log(`${RED}✗${RESET} ${testName}`);
  failedTests++;
  return '';
}

function assertFileAbsent(relPath, testName) {
  totalTests++;
  const fullPath = path.join(SERVER_ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Unexpected file: ${relPath}`);
    failedTests++;
  }
}

console.log(`${BLUE}UCSC Structured Content Regression Tests${RESET}`);

// Core files must exist
const index = assertFileExists('src/index.ts', 'index.ts exists');
const doFile = assertFileExists('src/do.ts', 'do.ts exists');
const aiStub = assertFileExists('src/ai-stub.ts', 'ai-stub.ts exists');
const catalog = assertFileExists('src/spec/catalog.ts', 'catalog.ts exists');
const adapter = assertFileExists('src/lib/api-adapter.ts', 'api-adapter.ts exists');
const http = assertFileExists('src/lib/http.ts', 'http.ts exists');
const codeMode = assertFileExists('src/tools/code-mode.ts', 'tools/code-mode.ts exists');
const queryData = assertFileExists('src/tools/query-data.ts', 'tools/query-data.ts exists');
const getSchema = assertFileExists('src/tools/get-schema.ts', 'tools/get-schema.ts exists');
const wrangler = assertFileExists('wrangler.jsonc', 'wrangler.jsonc exists');
const pkg = assertFileExists('package.json', 'package.json exists');

// Code Mode only — no hand-built tool files should leak through from the HPA template copy
assertFileAbsent('src/tools/gene-lookup.ts', 'gene-lookup.ts removed (Code Mode only)');
assertFileAbsent('src/tools/search.ts', 'search.ts removed (Code Mode only)');

// index.ts: Code Mode only wiring, expected DO export + server name
if (index) {
  assertContains('src/index.ts', index, 'UcscDataDO', 'index exports UcscDataDO');
  assertContains('src/index.ts', index, 'export { UcscDataDO }', 'index re-exports DO for wrangler');
  assertContains('src/index.ts', index, 'MyMCP', 'index declares MyMCP agent class');
  assertContains('src/index.ts', index, 'StatelessMcpWorker', 'index uses StatelessMcpWorker');
  assertContains('src/index.ts', index, '"ucsc"', 'index uses ucsc server name');
  assertContains('src/index.ts', index, '/health', 'index serves /health endpoint');
  assertContains('src/index.ts', index, '/mcp', 'index serves /mcp endpoint');
  assertContains('src/index.ts', index, 'registerCodeMode', 'index wires Code Mode');
  assertContains('src/index.ts', index, 'registerQueryData', 'index wires query_data');
  assertContains('src/index.ts', index, 'registerGetSchema', 'index wires get_schema');
  assertNotContains('src/index.ts', index, 'registerSearch', 'index does NOT register hand-built search');
  assertNotContains('src/index.ts', index, 'registerGeneLookup', 'index does NOT register gene-lookup');
}

// DO: must extend RestStagingDO
if (doFile) {
  assertContains('src/do.ts', doFile, 'RestStagingDO', 'DO extends RestStagingDO');
  assertContains('src/do.ts', doFile, 'UcscDataDO', 'DO class is UcscDataDO');
}

// ai-stub must export jsonSchema
if (aiStub) {
  assertContains('src/ai-stub.ts', aiStub, 'jsonSchema', 'ai-stub exports jsonSchema');
}

// Catalog: required categories, rate limit + liftover notes, range cap, smoke-test endpoints
if (catalog) {
  assertContains('src/spec/catalog.ts', catalog, 'ApiCatalog', 'catalog uses ApiCatalog type');
  assertContains('src/spec/catalog.ts', catalog, 'api.genome.ucsc.edu', 'catalog baseUrl is UCSC api');
  // Required category coverage (plan §5.6)
  assertContains('src/spec/catalog.ts', catalog, '"genomes"', 'catalog has genomes category');
  assertContains('src/spec/catalog.ts', catalog, '"tracks"', 'catalog has tracks category');
  assertContains('src/spec/catalog.ts', catalog, '"schema"', 'catalog has schema category');
  assertContains('src/spec/catalog.ts', catalog, '"sequence"', 'catalog has sequence category');
  assertContains('src/spec/catalog.ts', catalog, '"trackdata"', 'catalog has trackdata category');
  assertContains('src/spec/catalog.ts', catalog, '"search"', 'catalog has search category');
  // Required endpoint paths
  assertContains('src/spec/catalog.ts', catalog, '/list/ucscGenomes', 'catalog has /list/ucscGenomes');
  assertContains('src/spec/catalog.ts', catalog, '/list/hubGenomes', 'catalog has /list/hubGenomes');
  assertContains('src/spec/catalog.ts', catalog, '/list/tracks', 'catalog has /list/tracks');
  assertContains('src/spec/catalog.ts', catalog, '/list/schema', 'catalog has /list/schema');
  assertContains('src/spec/catalog.ts', catalog, '/list/chromosomes', 'catalog has /list/chromosomes');
  assertContains('src/spec/catalog.ts', catalog, '/getData/sequence', 'catalog has /getData/sequence');
  assertContains('src/spec/catalog.ts', catalog, '/getData/track', 'catalog has /getData/track');
  assertContains('src/spec/catalog.ts', catalog, '/search', 'catalog has /search');
  // Rate-limit, liftover, and range-cap notes per plan §5.6
  assertContains('src/spec/catalog.ts', catalog, '10,000 hits/day', 'catalog documents 10k/day rate limit');
  assertContains('src/spec/catalog.ts', catalog, 'liftover', 'catalog documents liftover omission');
  assertContains('src/spec/catalog.ts', catalog, '@bio-mcp/shared/variants/resolve', 'catalog routes liftover to the shared helper');
  assertContains('src/spec/catalog.ts', catalog, '100,000', 'catalog documents 100_000 bp range cap on /getData/sequence');
  // No dead endpoints
  assertNotContains('src/spec/catalog.ts', catalog, '/liftover', 'catalog does not expose a liftover endpoint');
}

// api-adapter + http: routes through UCSC, not HPA
if (adapter) {
  assertContains('src/lib/api-adapter.ts', adapter, 'ucscFetch', 'adapter uses ucscFetch');
  assertContains('src/lib/api-adapter.ts', adapter, 'createUcscApiFetch', 'adapter exports createUcscApiFetch');
  assertContains('src/lib/api-adapter.ts', adapter, 'ApiFetchFn', 'adapter conforms to ApiFetchFn');
}
if (http) {
  assertContains('src/lib/http.ts', http, 'api.genome.ucsc.edu', 'http module points at UCSC base URL');
  assertContains('src/lib/http.ts', http, 'ucscFetch', 'http module exports ucscFetch');
}

// Code mode registration
if (codeMode) {
  assertContains('src/tools/code-mode.ts', codeMode, '"ucsc"', 'code-mode registers ucsc prefix');
  assertContains('src/tools/code-mode.ts', codeMode, 'createSearchTool', 'code-mode uses shared createSearchTool');
  assertContains('src/tools/code-mode.ts', codeMode, 'createExecuteTool', 'code-mode uses shared createExecuteTool');
  assertContains('src/tools/code-mode.ts', codeMode, 'UCSC_DATA_DO', 'code-mode wires UCSC_DATA_DO binding');
  assertContains('src/tools/code-mode.ts', codeMode, 'CODE_MODE_LOADER', 'code-mode wires CODE_MODE_LOADER binding');
}

// Query data + schema tools: named with the correct prefix
if (queryData) {
  assertContains('src/tools/query-data.ts', queryData, 'ucsc_query_data', 'query-data registers ucsc_query_data');
  assertContains('src/tools/query-data.ts', queryData, 'createQueryDataHandler', 'query-data uses shared handler factory');
}
if (getSchema) {
  assertContains('src/tools/get-schema.ts', getSchema, 'ucsc_get_schema', 'get-schema registers ucsc_get_schema');
  assertContains('src/tools/get-schema.ts', getSchema, 'createGetSchemaHandler', 'get-schema uses shared handler factory');
}

// wrangler.jsonc: DO name + binding + worker loader + port
if (wrangler) {
  assertContains('wrangler.jsonc', wrangler, '"ucsc-mcp-server"', 'wrangler worker name is ucsc-mcp-server');
  assertContains('wrangler.jsonc', wrangler, '"UcscDataDO"', 'wrangler references UcscDataDO class');
  assertContains('wrangler.jsonc', wrangler, '"UCSC_DATA_DO"', 'wrangler binds UCSC_DATA_DO');
  assertContains('wrangler.jsonc', wrangler, '"mcp-2026-07-28-stateless"', 'wrangler deletes the retired transport class');
  assertContains('wrangler.jsonc', wrangler, 'CODE_MODE_LOADER', 'wrangler declares CODE_MODE_LOADER binding');
  assertContains('wrangler.jsonc', wrangler, '"nodejs_compat"', 'wrangler sets nodejs_compat flag');
  assertContains('wrangler.jsonc', wrangler, './src/ai-stub.ts', 'wrangler aliases ai to ai-stub');
  assertContains('wrangler.jsonc', wrangler, '8894', 'wrangler dev.port is 8894');
}

// package.json: required deps + port
if (pkg) {
  assertContains('package.json', pkg, '"ucsc-mcp-server"', 'package name is ucsc-mcp-server');
  assertContains('package.json', pkg, '"@bio-mcp/shared": "workspace:*"', 'package depends on @bio-mcp/shared workspace');
  assertContains('package.json', pkg, '"@modelcontextprotocol/server": "2.0.0"', 'MCP server SDK pinned to 2.0.0');
  assertContains('package.json', pkg, '"agents": "0.20.1"', 'agents pinned to 0.20.1');
  assertContains('package.json', pkg, '--port 8894', 'dev script uses port 8894');
}

console.log(`\n${BLUE}Test Results Summary${RESET}`);
console.log(`Total tests: ${totalTests}`);
console.log(`${GREEN}Passed: ${passedTests}${RESET}`);
console.log(`${RED}Failed: ${failedTests}${RESET}`);

if (failedTests > 0) {
  console.log(`\n${RED}Regression tests failed.${RESET}`);
  process.exit(1);
}

console.log(`\n${GREEN}UCSC structured content regression tests passed.${RESET}`);
