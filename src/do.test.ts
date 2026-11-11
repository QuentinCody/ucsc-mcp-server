/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
import { UcscDataDO } from "./do";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });
async function store(data: unknown) {
  const database = new DatabaseSync(":memory:"); databases.push(database);
  let ready: Promise<unknown> = Promise.resolve();
  const exec = (sql: string, ...args: SQLInputValue[]) => {
    const rows = database.prepare(sql).all(...args);
    return { toArray: () => rows, one: () => rows[0], [Symbol.iterator]: () => rows[Symbol.iterator]() };
  };
  const ctx = { blockConcurrencyWhile: (run: () => Promise<unknown>) => { ready = run(); return ready; },
    storage: { sql: { exec }, transactionSync: (run: () => unknown) => {
      database.exec("BEGIN"); try { const result = run(); database.exec("COMMIT"); return result; }
      catch (error) { database.exec("ROLLBACK"); throw error; }
    } } };
  // This test fixture implements only the Durable Object storage interfaces used here.
  const instance = new UcscDataDO(ctx as unknown as ConstructorParameters<typeof UcscDataDO>[0], {} as ConstructorParameters<typeof UcscDataDO>[1]);
  await ready;
  const result = await instance.fetch(new Request("https://fixture/process", { method: "POST", body: JSON.stringify({ data }) }));
  expect(await result.json()).toMatchObject({ success: true });
  return database;
}

it("materializes a complete single sequence and supports bounded SQL slices", async () => {
  const dna = "ACGTNacgtn".repeat(10001);
  const data = { genome: "hg38", chrom: "chr1", start: 0, end: dna.length, dna, downloadTime: "fixture" };
  const database = await store(data);
  expect(database.prepare("SELECT genome,chrom,start,end,length(dna) AS bases FROM sequence").get()).toEqual({ genome: "hg38", chrom: "chr1", start: 0, end: dna.length, bases: dna.length });
  let decoded = "";
  for (let start = 1; start <= dna.length; start += 5000) decoded += database.prepare("SELECT substr(dna,?,5000) AS part FROM sequence").get(start)?.part;
  expect(decoded).toBe(dna);
});

it("retains every native schema definition in schema_fields", async () => {
  const columnTypes = [{ name: "insLen", sqlType: "int", jsonType: "number", description: "Inserted bases" }, { name: "alleleFreq", sqlType: "float", jsonType: "number", description: "Cohort denominator retained" }];
  const database = await store({ genome: "hg38", track: "hprc2v21Sv", dataTime: "fixture", columnTypes });
  expect(database.prepare("SELECT name,sqlType,jsonType,description FROM schema_fields ORDER BY _rowid").all()).toEqual(columnTypes);
});

it("materializes restaged SQL without colliding with native _rowid fields", async () => {
  const rows = [{ _rowid: 7, insLen: 0, alleleFreq: 0.002155, native: { repeated: [1, 1] } }, { _rowid: 7, insLen: null, alleleFreq: 0 }];
  const database = await store({ content: [], structuredContent: { success: true, data: { rows, sql: "SELECT * FROM fixture" } } });
  expect(database.prepare("SELECT native_json FROM query_rows ORDER BY row_index").all().map(row => JSON.parse(String(row.native_json)))).toEqual(rows);
});
