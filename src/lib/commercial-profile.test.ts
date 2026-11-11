import { afterEach, describe, expect, it, vi } from "vitest";
import { ucscCatalog } from "../spec/catalog";
import { createUcscApiFetch } from "./api-adapter";
import {
  COMMERCIAL_ROUTES, COMMERCIAL_TRACK_ALLOWLIST, commercialUcscRefusal, isAllowlistedTrack, isLiftOverChainName, isPermittedTrack,
  isRestrictedTrack, PERMITTED_TRACKS, RESTRICTED_TRACK_WORDS, UCSC_LICENSE_URL, UCSC_PROTECTED_TRACKS,
} from "./commercial-profile";

// License audit 2026-11-10: "Exclude the restricted tracks and the liftOver
// chain files in the server." UCSC data is free for commercial use, but the
// liftOver chain files are "only for non-commercial use", and some providers
// (HGMD, LOVD, OMIM, DECIPHER, Genomenon, GeneHancer, COSMIC and more) restrict
// their tracks. The UCSC API itself refuses only a part of that data, so a
// reselling caller gets the rule of ./commercial-profile.
describe("UCSC adapter under the commercial license profile", () => {
  afterEach(() => vi.unstubAllGlobals());

  const api = createUcscApiFetch();
  const commercial = { method: "GET", licenseProfile: "commercial" as const };
  const range = { genome: "hg38", chrom: "chr17", start: 43000000, end: 43200000 };
  const REFUSED = { error: "NOT_LICENSED_FOR_COMMERCIAL_USE" };

  function stubUpstream(reply: () => Response = () => Response.json({ genome: "hg38" })) {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return reply();
    });
    return calls;
  }
  const group = (trackName: string, name = trackName) => ({ name, trackName, matches: [{ position: "chr17:43044295-43170327", posName: "113705" }] });
  const profile = (withheld: number) => ({ profile: "commercial", rule: expect.any(String), withheld_entries: withheld, terms: UCSC_LICENSE_URL });

  it.each([
    "omimGene2", "omimAvSnp", "OMIMGENE2", " geneHancerRegElements ", "hgmd", "ncbiRefSeqHgmd", "lovdComp", "cosmicMuts", "decipherSnvs",
    "cadd1_7_A", "clinPredA", "revelA", "mutScoreC", "mcapT", "spliceAiAccPlus", "alphaGenomeA", "primateAi", "promoterAiA",
    "tommoJpSv", "varaico", "abraom", "topmed", "NPM", "varFreqsArray",
  ])("refuses the track data of %s with HTTP 451 and makes no upstream request", async track => {
    const calls = stubUpstream();
    const result = await api({ ...commercial, path: "/getData/track", params: { ...range, track } });
    expect(result.status).toBe(451);
    expect(result.data).toMatchObject(REFUSED);
    expect(JSON.stringify(result.data)).toContain(`UCSC track data for ${track}`);
    expect(calls).toEqual([]);
  });

  it.each(["liftOverHg19", "liftOverHg19Link", "chm13LiftOver", "ucscHg38LiftOver", "chainLiftOverGCA_021950905_1", "LIFTOVERMM10"])(
    "refuses the liftOver chain data of %s with HTTP 451 and makes no upstream request", async track => {
      const calls = stubUpstream();
      const result = await api({ ...commercial, path: "/getData/track", params: { ...range, track } });
      expect(result.status).toBe(451);
      expect(result.data).toMatchObject(REFUSED);
      expect(JSON.stringify(result.data)).toContain(`UCSC liftOver chain data (${track})`);
      expect(calls).toEqual([]);
    });

  it.each([
    ["/getData/track?genome=hg38;track=omimGene2", "omimGene2"],
    ["/getData/track?genome=hg38&track=cosmicMuts&chrom=chr17", "cosmicMuts"],
    ["/getData/track?genome=hg38&track=%6FmimGene2", "omimGene2"],
    ["/getData/track?TRACK=hgmd", "hgmd"],
    ["/getData/track?genome=hs1;track=ucscHg38LiftOver", "ucscHg38LiftOver"],
  ])("reads a name in a query string inside the path: %s", async (path, track) => {
    const calls = stubUpstream();
    const result = await api({ ...commercial, path });
    expect(result.status).toBe(451);
    expect(result.data).toMatchObject(REFUSED);
    expect(JSON.stringify(result.data)).toContain(track);
    expect(calls).toEqual([]);
  });

  it.each([
    { path: "/getData/track", params: { genome: "hg38" } },
    { path: "/getData/track", params: { genome: "hg38", track: 7 } },
    { path: "/getData/track", params: { genome: "hg38", track: null } },
    { path: "/getData/track", params: { genome: "hg38", track: ["knownGene", 7] } },
    { path: "/getData/track", params: { genome: "hg38", track: ["knownGene", "refGene"] } },
    { path: "/getData/track?track=knownGene", params: { genome: "hg38", track: "refGene" } },
    { path: "/getData/track?track=%E0%A4%A", params: { genome: "hg38" } },
    { path: "/getData/sequence", params: { genome: "hg38", chrom: "chr1", hubUrl: 7 } },
    { path: "/getData/table", params: { genome: "hg38", track: "knownGene" } },
    { path: "/getdata/track", params: { genome: "hg38", track: "knownGene" } },
    { path: "https://api.genome.ucsc.edu/getData/track?genome=hg38;track=knownGene" },
  ])("fails closed on a data request that it cannot read: %j", async request => {
    const calls = stubUpstream();
    const result = await api({ ...commercial, ...request });
    expect(result.status).toBe(451);
    expect(result.data).toMatchObject(REFUSED);
    expect(JSON.stringify(result.data)).toContain("the license rule cannot read");
    expect(calls).toEqual([]);
  });

  it("refuses data that UCSC reads from a track hub, and keeps the hub lists", async () => {
    const calls = stubUpstream();
    const hubUrl = "https://example.org/hub.txt";
    for (const request of [
      { path: "/getData/track", params: { genome: "hg38", track: "anyTrack", hubUrl } },
      { path: "/getData/sequence", params: { genome: "hg38", chrom: "chr1", hubUrl } },
      { path: "/getData/sequence?hubUrl=https%3A%2F%2Fexample.org%2Fhub.txt", params: { genome: "hg38", chrom: "chr1" } },
    ]) {
      const result = await api({ ...commercial, ...request });
      expect(result.status, request.path).toBe(451);
      expect(result.data).toMatchObject(REFUSED);
      expect(JSON.stringify(result.data)).toContain("track hub (hubUrl)");
    }
    expect(calls).toEqual([]);
    expect((await api({ ...commercial, path: "/list/hubGenomes", params: { hubUrl } })).status).toBe(200);
    expect((await api({ ...commercial, path: "/list/tracks", params: { genome: "hg38", hubUrl } })).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("sends permitted data, sequence and list requests to upstream without a change", async () => {
    const native = { genome: "hg38", knownGene: [{ chrom: "chr17", chromStart: 43044294 }], itemsReturned: 1 };
    const requests = [
      { path: "/getData/track", params: { ...range, track: "knownGene" } },
      { path: "/getData/track", params: { ...range, track: "chainMm39" } },
      { path: "/getData/track", params: { ...range, track: "hprc2v21Sv", maxItemsOutput: 5 } },
      { path: "/getData/sequence", params: { genome: "hg38", chrom: "chr17", start: 1, end: 9 } },
      { path: "/list/tracks", params: { genome: "hg38" } },
      { path: "/list/schema", params: { genome: "hg38", track: "omimGene2" } },
      { path: "/list/chromosomes", params: { genome: "hg38", track: "liftOverHg19" } },
      { path: "/list/genarkGenomes", params: { genome: "GCF_028858775.2" } },
      { path: "/findGenome", params: { q: "omim liftOver" } },
      { path: "/list/ucscGenomes" },
      { path: "/list/publicHubs" },
    ];
    const plainCalls = stubUpstream(() => Response.json(native));
    for (const request of requests) expect(await api({ method: "GET", ...request })).toEqual({ status: 200, data: native });
    const profileCalls = stubUpstream(() => Response.json(native));
    for (const request of requests) expect(await api({ ...commercial, ...request }), request.path).toEqual({ status: 200, data: native });
    expect(profileCalls).toHaveLength(requests.length);
    expect(profileCalls).toEqual(plainCalls);
  });

  it("keeps the native cap evidence of a permitted track", async () => {
    const native = { genome: "hg38", knownGene: [{ chrom: "chr17" }], itemsReturned: 1, maxItemsLimit: true };
    stubUpstream(() => Response.json(native, { status: 206 }));
    const result = await api({ ...commercial, path: "/getData/track", params: { ...range, track: "knownGene", maxItemsOutput: 1 } });
    expect(result).toMatchObject({ status: 206, data: native, upstreamTotal: null, completeness: { complete: false } });
  });

  it("keeps only the search matches of allowlisted tracks and the trackDb group", async () => {
    const native = {
      genome: "hg38",
      positionMatches: [
        group("omimGene2"), group("knownGene"), group("mrna", "all_mrna"), group("otherName", "hgmd"), { matches: [] }, "text",
        group("trackDb"), group("liftOverHg19"), group("ncbiRefSeqCurated"), group("snp151"), group("knownGeneV49Omim"),
      ],
    };
    const calls = stubUpstream(() => Response.json(native));
    const result = await api({ ...commercial, path: "/search", params: { genome: "hg38", search: "113705" } });
    expect(result).toEqual({
      status: 200,
      data: {
        genome: "hg38",
        positionMatches: [group("knownGene"), group("trackDb"), group("ncbiRefSeqCurated"), group("snp151")],
        license_profile: profile(7),
      },
    });
    expect(calls).toHaveLength(1);
  });

  it.each(["all_mrna", "gtexGeneV8", "rmsk", "genomicSuperDups", "someNewTrack", "KNOWNGENE"])(
    "refuses a track that is not on the allowlist (%s) with HTTP 451, no upstream request, and the permitted names", async track => {
      const calls = stubUpstream();
      const result = await api({ ...commercial, path: "/getData/track", params: { ...range, track } });
      expect(result.status).toBe(451);
      expect(result.data).toMatchObject({ ...REFUSED, permitted_tracks: PERMITTED_TRACKS });
      expect(JSON.stringify(result.data)).toContain(`UCSC track data for ${track}`);
      expect(JSON.stringify(result.data)).toContain("allowlist");
      expect(calls).toEqual([]);
    });

  it("refuses a name that is on the allowlist by prefix and also restricted", async () => {
    for (const track of ["knownGeneV49Omim", "snp151Cadd", "wgEncodeRegCosmic", "dbSnp155LiftOver"]) {
      expect(isAllowlistedTrack(track), track).toBe(true);
      expect(isPermittedTrack(track), track).toBe(false);
      const calls = stubUpstream();
      const result = await api({ ...commercial, path: "/getData/track", params: { ...range, track } });
      expect(result.status, track).toBe(451);
      expect(result.data).not.toHaveProperty("permitted_tracks");
      expect(calls).toEqual([]);
    }
  });

  it("serves each allowlist name and prefix family", async () => {
    for (const track of ["knownGene", "knownGeneV49", "ncbiRefSeqSelect", "refGene", "ccdsGene", "mane", "snp151Common", "dbSnp155", "clinvarMain", "cytoBand", "phyloP100way", "encodeCcreCombined", "wgEncodeRegDnaseClustered", "netMm39"]) {
      expect(isPermittedTrack(track), track).toBe(true);
      const calls = stubUpstream(() => Response.json({ genome: "hg38", [track]: [] }));
      expect((await api({ ...commercial, path: "/getData/track", params: { ...range, track } })).status, track).toBe(200);
      expect(calls).toHaveLength(1);
    }
  });

  it("gives evidence for each group of the allowlist", () => {
    for (const entry of COMMERCIAL_TRACK_ALLOWLIST) {
      expect(entry.evidence.length, entry.group).toBeGreaterThan(40);
      expect(entry.names.length + (entry.prefixes?.length ?? 0), entry.group).toBeGreaterThan(0);
      for (const name of [...entry.names, ...(entry.prefixes ?? [])]) expect(isRestrictedTrack(name) || isLiftOverChainName(name), name).toBe(false);
    }
  });

  it("marks a search result that has no match, and withholds a match value that is not a list", async () => {
    stubUpstream(() => Response.json({ genome: "hg38" }));
    const search = { ...commercial, path: "/search", params: { genome: "hg38", search: "nothing" } };
    expect((await api(search)).data).toEqual({ genome: "hg38", license_profile: profile(0) });
    stubUpstream(() => Response.json({ genome: "hg38", positionMatches: { omimGene2: [{ position: "chr17:1-2" }] } }));
    expect((await api(search)).data).toEqual({ genome: "hg38", positionMatches: [], license_profile: profile(1) });
    stubUpstream(() => Response.json({ genome: "hg38", positionMatches: [group("knownGene")] }));
    expect((await api(search)).data).toEqual({ genome: "hg38", positionMatches: [group("knownGene")], license_profile: profile(0) });
  });

  it("withholds the entries for liftOver files from a JSON file list", async () => {
    const open = [{ url: "goldenPath/hs1/bigZips/hs1.2bit", sizeBytes: 812327608 }, { url: "goldenPath/hs1/vsMm39/hs1.mm39.all.chain.gz" }];
    const native = {
      genome: "hs1",
      urlList: [
        open[0],
        { url: "goldenPath/hs1/liftOver/hs1ToHg38.over.chain.gz", sizeBytes: 2 },
        { url: "gbdb/hs1/bbi/chainLiftOverHg38.bb" },
        { url: "gbdb/hs1/hgLiftOver/chm13v2-hg38.over.link.bb" },
        { url: "gbdb/hg38/liftOver/hg38ToMm39.chain.gz" },
        { sizeBytes: 3 },
        "goldenPath/hs1/bigZips/README.txt",
        open[1],
      ],
      itemsReturned: 8,
      totalBytes: 9,
    };
    const calls = stubUpstream(() => Response.json(native));
    const result = await api({ ...commercial, path: "/list/files", params: { genome: "hs1" } });
    expect(result).toEqual({ status: 200, data: { genome: "hs1", urlList: open, itemsReturned: 8, totalBytes: 9, license_profile: profile(6) } });
    expect(calls).toHaveLength(1);
  });

  it("withholds the lines for liftOver files from a plain-text file list", async () => {
    const host = "https://hgdownload.soe.ucsc.edu";
    const text = `# genome: hs1\n${host}/goldenPath/hs1/bigZips/hs1.2bit\n${host}/goldenPath/hs1/liftOver/hs1ToHg38.over.chain.gz\n${host}/gbdb/hs1/bbi/chainLiftOverHg38.bb\n# itemsReturned: 3\n`;
    const listing = { ...commercial, path: "/list/files", params: { genome: "hs1", format: "text" } };
    const note = (count: number) => `# license_profile: commercial. ${count} entries for liftOver files are withheld (${UCSC_LICENSE_URL}).\n`;
    stubUpstream(() => new Response(text));
    expect((await api(listing)).data).toBe(`# genome: hs1\n${host}/goldenPath/hs1/bigZips/hs1.2bit\n# itemsReturned: 3\n${note(2)}`);
    stubUpstream(() => new Response(`${host}/goldenPath/hs1/liftOver/hs1ToHg38.over.chain.gz`));
    expect((await api(listing)).data).toBe(note(1));
    stubUpstream(() => new Response(`${host}/goldenPath/hs1/bigZips/hs1.2bit`));
    expect((await api(listing)).data).toBe(`${host}/goldenPath/hs1/bigZips/hs1.2bit\n${note(0)}`);
  });

  it("refuses a file list or a search result that it cannot read", async () => {
    const calls = stubUpstream(() => Response.json({ genome: "hs1", files: [{ url: "goldenPath/hs1/liftOver/hs1ToHg38.over.chain.gz" }] }));
    const result = await api({ ...commercial, path: "/list/files", params: { genome: "hs1" } });
    expect(result.status).toBe(451);
    expect(result.data).toMatchObject(REFUSED);
    expect(JSON.stringify(result.data)).not.toContain("over.chain");
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["/gbdb/hs1/hgLiftOver/chm13v2-hg38.over.chain.bb", "UCSC liftOver chain data"],
    ["/gbdb/hg38/cadd1.7/a.bw", "UCSC track data for"],
  ])("refuses a result of an allowlisted track whose file is %s (the second check)", async (bigDataUrl, reason) => {
    const calls = stubUpstream(() => Response.json({ genome: "hg38", track: "cytoBand", bigDataUrl, cytoBand: [{ chrom: "chr17", value: 35 }] }));
    const result = await api({ ...commercial, path: "/getData/track", params: { ...range, track: "cytoBand" } });
    expect(result).toEqual({ status: 451, data: { ...REFUSED, message: expect.stringContaining(reason) } });
    expect(calls).toHaveLength(1);
  });

  it("serves a track result whose file is a permitted file", async () => {
    const native = { genome: "hg38", bigDataUrl: "/gbdb/hg38/hprc/hprc2v21Sv.bb", hprc2v21Sv: [{ chrom: "chr17" }], bigData: 7 };
    stubUpstream(() => Response.json(native));
    expect(await api({ ...commercial, path: "/getData/track", params: { ...range, track: "hprc2v21Sv" } })).toEqual({ status: 200, data: native });
    stubUpstream(() => Response.json({ ...native, bigDataUrl: 7 }));
    expect((await api({ ...commercial, path: "/getData/track", params: { ...range, track: "hprc2v21Sv" } })).status).toBe(200);
  });

  it("does not change a caller without the commercial profile", async () => {
    const hubUrl = "https://example.org/hub.txt";
    const cases: Array<[{ path: string; params: Record<string, unknown> }, Record<string, unknown>]> = [
      [{ path: "/getData/track", params: { ...range, track: "omimGene2" } }, { genome: "hg38", omimGene2: [{ name: "113705" }] }],
      [{ path: "/getData/track", params: { ...range, track: "cadd1_7_A" } }, { bigDataUrl: "/gbdb/hg38/cadd1.7/a.bw", cadd1_7_A: [{ value: 35 }] }],
      [{ path: "/getData/track", params: { ...range, track: "liftOverHg19" } }, { bigDataUrl: "/gbdb/hg38/x.over.chain.bb", liftOverHg19: [{ id: 18 }] }],
      [{ path: "/getData/track", params: { genome: "hg38", track: "anyTrack", hubUrl } }, { anyTrack: [{ chrom: "chr1" }] }],
      [{ path: "/getData/sequence", params: { genome: "hg38", chrom: "chr1", hubUrl } }, { dna: "ACGT" }],
      [{ path: "/search", params: { genome: "hg38", search: "113705" } }, { positionMatches: [group("omimGene2"), { matches: [] }] }],
      [{ path: "/list/files", params: { genome: "hs1" } }, { urlList: [{ url: "goldenPath/hs1/liftOver/hs1ToHg38.over.chain.gz" }] }],
      [{ path: "/list/files", params: { genome: "hs1" } }, { files: [] }],
    ];
    for (const [request, native] of cases) {
      const calls = stubUpstream(() => Response.json(native));
      expect(await api({ method: "GET", ...request }), JSON.stringify(request)).toEqual({ status: 200, data: native });
      expect(calls).toHaveLength(1);
      expect(new URL(calls[0]).searchParams.get("track")).toBe(request.params.track ?? null);
    }
    const text = "https://hgdownload.soe.ucsc.edu/goldenPath/hs1/liftOver/hs1ToHg38.over.chain.gz\n";
    stubUpstream(() => new Response(text));
    expect((await api({ method: "GET", path: "/list/files", params: { genome: "hs1", format: "text" } })).data).toBe(text);
  });

  it("keeps the request errors of the adapter for each caller", async () => {
    const calls = stubUpstream();
    await expect(api({ method: "GET", path: "/getData/track", params: { genome: "hg38" } })).rejects.toThrow("Missing UCSC parameter: track");
    for (const profile of [{}, { licenseProfile: "commercial" as const }]) {
      await expect(api({ method: "GET", path: "/list/track", params: { genome: "hg38" }, ...profile })).rejects.toThrow("Unsupported UCSC API route");
      await expect(api({ method: "GET", path: "/getData/track?genome=hg38;track=knownGene", ...profile })).rejects.toThrow("Unsupported UCSC API route");
      await expect(api({ method: "POST", path: "/getData/track", params: { ...range, track: "knownGene" }, ...profile })).rejects.toThrow("UCSC requires GET");
      await expect(api({ method: "GET", path: "/list/schema", params: { genome: "hg38" }, ...profile })).rejects.toThrow("Missing UCSC parameter: track");
    }
    expect(calls).toEqual([]);
  });

  it("classifies each route of the catalog, and refuses a catalog route that it does not classify", async () => {
    expect([...COMMERCIAL_ROUTES.keys()].sort()).toEqual(ucscCatalog.endpoints.map(endpoint => endpoint.path).sort());
    expect([...COMMERCIAL_ROUTES].filter(([, kind]) => kind !== "open").sort()).toEqual([
      ["/getData/sequence", "data"], ["/getData/track", "data"], ["/list/files", "files"], ["/search", "search"],
    ]);
    ucscCatalog.endpoints.push({ method: "GET", path: "/list/newRoute", summary: "A route that the rule does not know", category: "genomes" });
    try {
      const calls = stubUpstream();
      const result = await api({ ...commercial, path: "/list/newRoute" });
      expect(result).toEqual({ status: 451, data: { ...REFUSED, message: expect.stringContaining("The UCSC route /list/newRoute") } });
      expect(calls).toEqual([]);
      expect((await api({ method: "GET", path: "/list/newRoute" })).status).toBe(200);
      expect(calls).toHaveLength(1);
    } finally {
      ucscCatalog.endpoints.pop();
    }
  });

  it("gives no refusal for the open routes", () => {
    expect(commercialUcscRefusal({ ...commercial, path: "/list/schema", params: { genome: "hg38", track: "omimGene2" } })).toBeUndefined();
    expect(commercialUcscRefusal({ ...commercial, path: "/search", params: { genome: "hg38", search: "omim" } })).toBeUndefined();
    expect(commercialUcscRefusal({ ...commercial, path: "/list/files", params: { genome: "hs1" } })).toBeUndefined();
    expect(commercialUcscRefusal({ ...commercial, path: "/getData/sequence", params: { genome: "hg38", chrom: "chr1" } })).toBeUndefined();
    expect(commercialUcscRefusal({ ...commercial, path: "/getData/track", params: { ...range, track: "knownGene" } })).toBeUndefined();
    expect(commercialUcscRefusal({ ...commercial, path: "/not/a/route" })).toBeUndefined();
  });

  it("identifies the restricted names", () => {
    for (const name of [...RESTRICTED_TRACK_WORDS, ...UCSC_PROTECTED_TRACKS, "omimGene2", "OMIMLOCATION", "geneHancerInteractionsDoubleElite", "lovdShort",
      "decipherPopulation", "cosmicRegions", "caddSuper1_7", "spliceAIsnvsMasked", "revelOverlaps", "sfarisparkwgs", "ＯＭＩＭGene2", " topmed "]) {
      expect(isRestrictedTrack(name), name).toBe(true);
    }
    for (const name of ["knownGene", "refGene", "ncbiRefSeqCurated", "dbSnp155", "clinvarMain", "gnomadGenomesVariantsV4_1", "hprc2v21Sv", "rmsk",
      "chainMm39", "netMm39", "cpgIslandExt", "gtexGeneV8", "alphaMissense", "npmExtra", "topmedFreeze", "kovalent", ""]) {
      expect(isRestrictedTrack(name), name).toBe(false);
    }
  });

  it("identifies the liftOver names", () => {
    for (const name of ["liftOverHg19", "liftOverHg19Link", "chm13LiftOver", "t2tHg38LiftOver", "GCA_021951015_1liftOver", "hg38ToHg19.over.chain.gz",
      "goldenPath/hg38/liftOver/README.txt", "gbdb/hs1/bbi/hg38.liftOverNet.bb", "lift_over", "Lift Over", "LIFT-OVER", "x.OVER.CHAIN"]) {
      expect(isLiftOverChainName(name), name).toBe(true);
    }
    for (const name of ["chainMm39", "netMm39", "chainHg19ReMap", "catLiftOffGenesV1", "knownGeneV45lift37", "liftHg19", "hs1.mm39.all.chain.gz", "overlapChain", ""]) {
      expect(isLiftOverChainName(name), name).toBe(false);
    }
  });
});
