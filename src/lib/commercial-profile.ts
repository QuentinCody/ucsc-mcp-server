/**
 * The commercial license profile for the UCSC Genome Browser API.
 *
 * License audit 2026-11-10: "Exclude the restricted tracks and the liftOver
 * chain files in the server."
 *
 * The terms (https://genome.ucsc.edu/license/): the table data and the files
 * of the browser are "freely available for both public and commercial use",
 * also "via the web API". "The only exception are the liftOver chain files,
 * they can be linked, downloaded, used and redistributed, but only for
 * non-commercial use". And: "Certain genome annotation data, mostly on the
 * human genome and in the domain of clinical genetics, have specific
 * restrictions. [...] Examples are HGMD, LOVD, OMIM, Decipher, Genomenon,
 * Genehancer and COSMIC." The conditions of use
 * (https://genome.ucsc.edu/conditions.html) send the reader to the
 * description page of each track for its restrictions.
 *
 * Facts from the live service on 2026-11-10 that set the rule:
 * - The API refuses (HTTP 403, "protected data") only a part of that data. It
 *   returns OMIM, GeneHancer and COSMIC (`cosmicMuts`) rows for a position
 *   range. It returns CADD, ClinPred, REVEL, SpliceAI wildtype, Varaico and
 *   ToMMo rows, and their providers give a non-commercial condition. The 403
 *   of the provider is thus not the rule.
 * - liftOver chains are tracks and tables too (`liftOverHg19`,
 *   `liftOverHg19Link`, `chm13LiftOver`, `ucscHg38LiftOver`):
 *   `/getData/track` returns their rows, and `/list/files` gives the links to
 *   the chain files.
 * - `/search` returns position matches from restricted tracks: an OMIM number
 *   gives an `omimGene2` match.
 * - `hubUrl` makes UCSC read a track hub on any host. The terms of a hub are
 *   those of its owner, and a public hub for GeneHancer exists.
 *
 * UCSC hosts thousands of tracks from other providers, and a description page
 * does not always give the terms of the provider (REVEL, M-CAP). A list of
 * refused names thus lets an unknown restricted track pass. The track rule is
 * an allowlist: `COMMERCIAL_TRACK_ALLOWLIST` has only the tracks whose terms
 * are confirmed, with the evidence for each group.
 *
 * A reselling caller (`licenseProfile: "commercial"`) thus gets track data
 * only for a name on the allowlist. The list of restricted names and the
 * liftOver rule are a second check: a name that matches them is refused, also
 * if it is on the allowlist. The caller gets no data through a track hub, no
 * search match from a track that is not on the allowlist, and no file-list
 * entry for a liftOver file. Lists, schemas and the genome sequence stay. A
 * data request that the rule cannot read is refused.
 */

import { type ApiFetchFn, commercialUseRefusal } from "@bio-mcp/shared/codemode/catalog";
import { ucscCatalog } from "../spec/catalog";

type UcscRequest = Parameters<ApiFetchFn>[0];
type UcscResult = Awaited<ReturnType<ApiFetchFn>>;
type Refusal = ReturnType<typeof commercialUseRefusal>;
type Pair = [key: string, value: unknown];

export const UCSC_LICENSE_URL = "https://genome.ucsc.edu/license/";

/**
 * A track or a table is restricted if its name contains one of these words.
 * The comparison ignores case.
 *
 * Line 1: the providers that the UCSC license page names. Line 2: a condition
 * on the description page of the track (trackDb of hg38 and hg19): CADD and
 * ClinPred are "freely available for [all] non-commercial applications",
 * SpliceAI is "FOR ACADEMIC AND NOT-FOR-PROFIT RESEARCH USE ONLY", ABraOM is
 * "For academic use only", ToMMo wants a request for permission "prior to
 * using the data for commercial purposes", Varaico "permits non-commercial
 * use", and UCSC may not redistribute PrimateAI, PromoterAI and AlphaGenome.
 * Line 3: a condition on the page of the provider only: REVEL and MutScore
 * are "freely available for non-commercial use", M-CAP is CC BY-NC 4.0.
 *
 * A word also matches a name that only refers to a provider
 * (`ncbiRefSeqHgmd`, `dbVar_common_decipher`, the Agilent COSMIC probe sets,
 * `tommo60kjpn`). The terms of those tracks are not confirmed, so the rule
 * refuses them too.
 */
export const RESTRICTED_TRACK_WORDS: readonly string[] = [
  "omim", "decipher", "cosmic", "lovd", "hgmd", "genehancer", "genomenon", "mastermind", "gisaid",
  "cadd", "clinpred", "spliceai", "primateai", "promoterai", "alphagenome", "abraom", "tommo", "varaico",
  "revel", "mutscore", "mcap",
];

/**
 * Tracks that UCSC marks `protectedData` in `/list/tracks` (hg38, hg19, hs1
 * and mm39 on 2026-11-10) and that no word above matches. Their pages say:
 * "Due to license restrictions, the data for this track cannot be downloaded
 * from the UCSC Genome Browser." The comparison is on the full name, because
 * some of the names are short.
 */
export const UCSC_PROTECTED_TRACKS: readonly string[] = [
  "allofus", "chinamap", "epigenCentral", "finngen", "genomeindia", "kova", "meiSwegen", "mexbb", "mgrb", "mxbFreq",
  "npm", "sfariSparkExomes", "sfariSparkWgs", "swefreq", "tishkoff180", "topmed", "tpmi",
  "varFreqsAffected", "varFreqsArray", "varFreqsBackground",
];

const fold = (name: string) => name.normalize("NFKC").trim().toLowerCase();
const PROTECTED = new Set(UCSC_PROTECTED_TRACKS.map(fold));

/** True for a track or a table that a commercial product does not serve. */
export function isRestrictedTrack(name: string): boolean {
  const key = fold(name);
  return PROTECTED.has(key) || RESTRICTED_TRACK_WORDS.some(word => key.includes(word));
}

/**
 * True for a track, a table or a file that holds liftOver chains. The rule is
 * on the name only, so it also matches the alignment tracks
 * `altSeqLiftOverPsl` and `fixSeqLiftOverPsl` and the gnomAD files with
 * `liftover_grch38` in their name. Those are not chain files; the rule
 * refuses them because it does not read more than the name.
 */
export function isLiftOverChainName(name: string): boolean {
  return /lift[\s_-]?over|over\.chain/.test(fold(name));
}

/** One group of tracks that a commercial product serves, and the evidence for its terms. */
export interface PermittedTracks {
  group: string;
  /** Full names of tracks or tables. The comparison is exact and keeps the case. */
  names: readonly string[];
  /** Name prefixes, only where UCSC gives a number to each member of a family. */
  prefixes?: readonly string[];
  /** The source of the terms, with a quote or the statement about the description. */
  evidence: string;
}

const NCBI_TERMS = 'https://www.ncbi.nlm.nih.gov/home/about/policies/: "NCBI itself places no restrictions on the use or distribution of the data contained therein."';
const GENCODE_TERMS = 'https://www.gencodegenes.org/pages/data_access.html: "All the GENCODE project data is open access".';
const ENCODE_TERMS = 'https://www.encodeproject.org/help/citing-encode/: "External data users may freely download, analyze and publish results based on any ENCODE data without restrictions."';

/**
 * The tracks that a commercial product serves. Each entry is a track that
 * UCSC or a U.S. government source produces, or that has an open statement of
 * its provider. "Description" is the description page of the track in the
 * trackDb table of hg38, hg19 and mm39 (hgdownload.soe.ucsc.edu, 2026-11-10).
 * For each name and each prefix, no description in those three assemblies has
 * a non-commercial, an academic-only or a license condition; the one sentence
 * that comes near is quoted in the ClinVar entry.
 *
 * Not on the list, because the terms are not confirmed: GTEx (its license page
 * was not readable), `rmsk` and `nestedRepeats` (the description names the
 * commercial license of RepBase), `genomicSuperDups`, `cytoBandIdeo` (no
 * description), the 470-way, 447-way and 241-way conservation tracks, and each
 * track that was not checked. Add a track only with its evidence.
 */
export const COMMERCIAL_TRACK_ALLOWLIST: readonly PermittedTracks[] = [
  {
    group: "GENCODE gene models",
    names: ["knownGene"],
    prefixes: ["knownGeneV", "wgEncodeGencode"],
    evidence: `${GENCODE_TERMS} Description: "The GENCODE Genes track was produced at UCSC from the GENCODE comprehensive gene set". The prefixes are the numbered GENCODE releases (knownGeneV49, knownGeneVM38, wgEncodeGencodeBasicV48, wgEncodeGencodeCompVM39).`,
  },
  {
    group: "NCBI RefSeq gene models",
    names: ["ncbiRefSeq", "ncbiRefSeqCurated", "ncbiRefSeqPredicted", "ncbiRefSeqOther", "ncbiRefSeqPsl", "ncbiRefSeqSelect", "ncbiRefSeqGenomicDiff", "refGene"],
    evidence: `${NCBI_TERMS} Description: "All subtracks use coordinates provided by RefSeq, except for the UCSC RefSeq track, which UCSC produces by realigning the RefSeq RNAs to the genome."`,
  },
  {
    group: "CCDS and MANE gene models",
    names: ["ccdsGene", "mane"],
    evidence: `${NCBI_TERMS} ${GENCODE_TERMS} Descriptions: ccdsGene "was produced at UCSC from data downloaded from the CCDS project web site"; mane has the transcripts of "RefSeq (NCBI) and Ensembl/GENCODE (led by EMBL-EBI)".`,
  },
  {
    group: "dbSNP",
    names: [],
    prefixes: ["snp1", "dbSnp1"],
    evidence: `${NCBI_TERMS} Description: variants "from dbSNP build 151"; no use restriction in the description. The prefixes are the dbSNP builds 138 to 155 (snp151, snp151Common, dbSnp155, dbSnp155Common).`,
  },
  {
    group: "ClinVar",
    names: ["clinvarMain", "clinvarCnv"],
    evidence: `${NCBI_TERMS} Description: "Thanks to NCBI for making the ClinVar data available on their FTP site". The description also says that ClinVar "is open to all academic users", in a sentence on medical advice; it gives no license condition.`,
  },
  {
    group: "Assembly annotation",
    names: ["gap", "gold", "cytoBand"],
    evidence: 'No use restriction in the description; data produced by UCSC from the assembly files of the Genome Reference Consortium and NCBI: gaps and contigs "defined in the AGP file delivered with the sequence", bands "downloaded from NCBI using the ideogram.gz file".',
  },
  {
    group: "Annotation that UCSC computes from the genome sequence",
    names: ["gc5BaseBw", "cpgIslandExt", "cpgIslandExtUnmasked", "simpleRepeat", "microsat", "windowmaskerSdust"],
    evidence: "No use restriction in the description; data produced by UCSC from the genome sequence (GC percent, CpG islands, Tandem Repeats Finder, NCBI WindowMasker).",
  },
  {
    group: "Conservation: the UCSC multiz alignments of 100, 30, 46 and 35 species",
    names: [
      "multiz100way", "phastCons100way", "phastConsElements100way", "phyloP100way", "phyloP100wayAll",
      "multiz30way", "phastCons30way", "phastConsElements30way", "phyloP30way", "phyloPSSREV30way",
      "multiz46way", "phastCons46way", "phastCons46wayPlacental", "phastCons46wayPrimates", "phastConsElements46way",
      "phastConsElements46wayPlacental", "phastConsElements46wayPrimates", "phyloP46wayAll", "phyloP46wayPlacental", "phyloP46wayPrimates",
      "multiz35way", "phastCons35way", "phastConsElements35way", "phyloP35way",
    ],
    evidence: 'No use restriction in the description; data produced by UCSC: "The multiple alignments were generated using multiz and other tools in the UCSC/Penn State Bioinformatics comparative genomics alignment pipeline."',
  },
  {
    group: "ENCODE",
    names: ["encodeCcreCombined", "encRegTfbsClustered"],
    prefixes: ["wgEncodeReg"],
    evidence: `${ENCODE_TERMS} Description of the ENCODE Regulation super track: "Users may freely download, analyze and publish results based on any ENCODE data without restrictions." The prefix is the family of that super track (wgEncodeRegDnaseClustered, wgEncodeRegMarkH3k27acGm12878).`,
  },
  {
    group: "Pairwise alignments (chain and net)",
    names: [
      "chainMm39", "netMm39", "chainMm10", "netMm10", "chainPanTro6", "netPanTro6", "chainRheMac10", "netRheMac10",
      "chainHg38", "netHg38", "chainRn7", "netRn7",
    ],
    evidence: 'README.txt of the alignment directory (hgdownload.soe.ucsc.edu/goldenPath/<db>/vs<Other>/): "All files in this directory are freely available for public use." Read for hg38 (vsMm39, vsMm10, vsPanTro6, vsRheMac10), hg19 (vsMm10, vsRheMac10) and mm39 (vsHg38, vsRn7). No prefix: other chain names hold liftOver, ReMap or HPRC alignments.',
  },
  {
    group: "HPRC structural variants",
    names: ["hprc2v21Sv"],
    evidence: 'https://humanpangenome.org/data-use/: "Users: Any individual, institution, or entity using the Pangenome Reference, including both commercial and non-commercial use." No use restriction in the description.',
  },
];

const ALLOWED_NAMES: ReadonlySet<string> = new Set(COMMERCIAL_TRACK_ALLOWLIST.flatMap(entry => entry.names));
const ALLOWED_PREFIXES: readonly string[] = COMMERCIAL_TRACK_ALLOWLIST.flatMap(entry => entry.prefixes ?? []);

/** The allowlist in the form that a result gives to the caller. */
export const PERMITTED_TRACKS = {
  names: [...ALLOWED_NAMES],
  prefixes: ALLOWED_PREFIXES,
  note: "A name with the word of a restricted provider, or a liftOver name, is refused also if it starts with a prefix.",
};

/** True for a name on the allowlist. The comparison is exact: UCSC track names keep their case. */
export function isAllowlistedTrack(name: string): boolean {
  return ALLOWED_NAMES.has(name) || ALLOWED_PREFIXES.some(prefix => name.startsWith(prefix));
}

/** True for a track that a commercial product serves: on the allowlist, and not refused by the second check. */
export function isPermittedTrack(name: string): boolean {
  return isAllowlistedTrack(name) && !isRestrictedTrack(name) && !isLiftOverChainName(name);
}

type RouteKind = "open" | "data" | "search" | "files";
const routes = (kind: RouteKind, ...paths: string[]) => paths.map((path): [string, RouteKind] => [path, kind]);

/**
 * What the profile does on each route of the catalog. `open`: no change.
 * `data`: the name rule. `search` and `files`: the result loses the entries
 * that are not permitted. A catalog route that is not here is refused.
 */
export const COMMERCIAL_ROUTES: ReadonlyMap<string, RouteKind> = new Map([
  ...routes("open", "/list/ucscGenomes", "/list/hubGenomes", "/list/chromosomes", "/list/tracks", "/list/schema",
    "/list/publicHubs", "/list/genarkGenomes", "/findGenome"),
  ...routes("data", "/getData/track", "/getData/sequence"),
  ...routes("search", "/search"),
  ...routes("files", "/list/files"),
]);

const refuse = {
  restricted: (names: string[]) => commercialUseRefusal(
    `UCSC track data for ${names.join(", ")}`,
    `the provider of that data restricts its use or its redistribution (${UCSC_LICENSE_URL} and the description page of the track). Get the data from the source database under the license of that provider. /list/tracks and /list/schema stay available`,
  ),
  liftOver: (names: string[]) => commercialUseRefusal(
    `UCSC liftOver chain data (${names.join(", ")})`,
    `UCSC permits its liftOver chain files for non-commercial use only (${UCSC_LICENSE_URL}). A commercial license is available at https://genome-store.ucsc.edu`,
  ),
  notPermitted: (names: string[]): Refusal => {
    const refusal = commercialUseRefusal(
      `UCSC track data for ${names.join(", ")}`,
      "the terms of that track are not confirmed for commercial use, and this product serves only the tracks on its allowlist. permitted_tracks gives the names and the name prefixes. /list/tracks and /list/schema stay available",
    );
    return { ...refusal, data: { ...refusal.data, permitted_tracks: PERMITTED_TRACKS } };
  },
  hub: () => commercialUseRefusal(
    "Data that UCSC reads from a track hub (hubUrl)",
    "the terms of a hub are those of its owner and are not confirmed. An assembly that UCSC hosts, a GenArk accession included, needs no hubUrl. The hub lists (/list/publicHubs, /list/hubGenomes, /list/tracks) stay available",
  ),
  unreadable: () => commercialUseRefusal(
    "A UCSC data request that the license rule cannot read",
    "the rule must know which data the request asks for. Use /getData/track with one `track` name as text, or /getData/sequence",
  ),
  unclassified: (route: string) => commercialUseRefusal(`The UCSC route ${route}`, "the license rule does not classify this route yet"),
  result: (route: string) => commercialUseRefusal(
    `The result of the UCSC route ${route}`,
    "it does not have the form that the license rule can read, so the rule cannot remove the entries that are not permitted",
  ),
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Null for text that is not a valid percent-encoding: the rule cannot read it. */
function decode(text: string): string | null {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

/** The route of a request and its query pairs: a query string inside the path ('&' or ';'), then the params. */
function readRequest(request: UcscRequest): { route: string; pairs: Pair[] } {
  const mark = request.path.indexOf("?");
  if (mark < 0) return { route: request.path, pairs: Object.entries(request.params ?? {}) };
  const inPath = request.path.slice(mark + 1).split(/[&;]/).filter(Boolean).map((pair): Pair => {
    const [key, ...value] = pair.split("=");
    return [decode(key) ?? key, decode(value.join("="))];
  });
  return { route: request.path.slice(0, mark), pairs: [...inPath, ...Object.entries(request.params ?? {})] };
}

/** Each text value of one query key; the key comparison ignores case. Null if a value is not text. */
function valuesOf(pairs: Pair[], key: string): string[] | null {
  const found: string[] = [];
  for (const [name, value] of pairs) {
    if (name.toLowerCase() !== key || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item !== "string") return null;
      found.push(item);
    }
  }
  return found;
}

function namedDataRefusal(route: string, tracks: string[], hubs: string[]): Refusal | undefined {
  const restricted = tracks.filter(isRestrictedTrack);
  if (restricted.length > 0) return refuse.restricted(restricted);
  const chains = tracks.filter(isLiftOverChainName);
  if (chains.length > 0) return refuse.liftOver(chains);
  if (hubs.length > 0) return refuse.hub();
  if (route !== "/getData/track") return undefined;
  if (tracks.length !== 1) return refuse.unreadable();
  // The allowlist: a track whose terms are not confirmed is not served (fail closed).
  return isAllowlistedTrack(tracks[0]) ? undefined : refuse.notPermitted(tracks);
}

/**
 * The refusal for a request that a commercial product does not send, or
 * undefined. The rule reads the `track` and `hubUrl` values in the params and
 * in a query string inside the path. A path that is not a route of the
 * catalog gets no refusal here: the request check that follows rejects it,
 * as it does for each caller.
 */
export function commercialUcscRefusal(request: UcscRequest): Refusal | undefined {
  const { route, pairs } = readRequest(request);
  const kind = COMMERCIAL_ROUTES.get(route);
  const dataRoute = kind === "data" || (kind === undefined && /getdata/i.test(route));
  if (!dataRoute) {
    const unclassified = kind === undefined && ucscCatalog.endpoints.some(item => item.path === route);
    return unclassified ? refuse.unclassified(route) : undefined;
  }
  const tracks = valuesOf(pairs, "track");
  const hubs = valuesOf(pairs, "huburl");
  if (kind === undefined || tracks === null || hubs === null) return refuse.unreadable();
  return namedDataRefusal(route, tracks, hubs);
}

const profile = (rule: string, withheld: number) => ({ profile: "commercial", rule, withheld_entries: withheld, terms: UCSC_LICENSE_URL });
const SEARCH_RULE =
  "Position matches are kept only from the tracks on the allowlist of this product (and the trackDb group, which names tracks only); each other match group is withheld. withheld_entries is the number of match groups.";

/** Search groups that name tracks and hold no track data. */
const NON_TRACK_GROUPS: ReadonlySet<string> = new Set(["trackDb"]);
const FILES_RULE = "Entries for liftOver files are withheld: UCSC permits its liftOver chain files for non-commercial use only. itemsReturned and totalBytes are the counts of the provider before the removal.";

/**
 * A match group is kept only when its track is on the allowlist and no name
 * of the group is restricted. A group without a track name is withheld: the
 * rule cannot tell its source.
 */
function isWithheldGroup(group: unknown): boolean {
  const names = isRecord(group) ? [group.trackName, group.name].filter((name): name is string => typeof name === "string") : [];
  if (names.length === 0 || names.some(name => isRestrictedTrack(name) || isLiftOverChainName(name))) return true;
  const track = names[0];
  return !(NON_TRACK_GROUPS.has(track) || isPermittedTrack(track));
}

function withoutRestrictedMatches(result: UcscResult, route: string): UcscResult {
  const { data } = result;
  if (!isRecord(data)) return refuse.result(route);
  const found = data.positionMatches;
  if (found === undefined) return { ...result, data: { ...data, license_profile: profile(SEARCH_RULE, 0) } };
  const groups: unknown[] = Array.isArray(found) ? found : [found];
  const positionMatches = groups.filter(group => !isWithheldGroup(group));
  return { ...result, data: { ...data, positionMatches, license_profile: profile(SEARCH_RULE, groups.length - positionMatches.length) } };
}

function withoutChainLines(text: string): string {
  const lines = text.split("\n");
  const kept = lines.filter(line => !isLiftOverChainName(line));
  const body = kept.join("\n");
  const end = body === "" || body.endsWith("\n") ? "" : "\n";
  return `${body}${end}# license_profile: commercial. ${lines.length - kept.length} entries for liftOver files are withheld (${UCSC_LICENSE_URL}).\n`;
}

function withoutChainFiles(result: UcscResult, route: string): UcscResult {
  const { data } = result;
  if (typeof data === "string") return { ...result, data: withoutChainLines(data) };
  if (!isRecord(data) || !Array.isArray(data.urlList)) return refuse.result(route);
  const urlList = data.urlList.filter(entry => isRecord(entry) && typeof entry.url === "string" && !isLiftOverChainName(entry.url));
  return { ...result, data: { ...data, urlList, license_profile: profile(FILES_RULE, data.urlList.length - urlList.length) } };
}

/** The refusal for track data whose file (`bigDataUrl`) the name rule identifies: a track with a name that the rule does not know. */
function dataFileRefusal(data: unknown): Refusal | undefined {
  const file = isRecord(data) ? data.bigDataUrl : undefined;
  if (typeof file !== "string") return undefined;
  if (isLiftOverChainName(file)) return refuse.liftOver([file]);
  return isRestrictedTrack(file) ? refuse.restricted([file]) : undefined;
}

/** Remove from a provider result what a commercial product does not pass on. */
export function commercialUcscResult(request: UcscRequest, result: UcscResult): UcscResult {
  const kind = COMMERCIAL_ROUTES.get(request.path);
  if (kind === "search") return withoutRestrictedMatches(result, request.path);
  if (kind === "files") return withoutChainFiles(result, request.path);
  if (kind === "data") return dataFileRefusal(result.data) ?? result;
  return result;
}

/**
 * The UCSC API for a reselling caller. `readUcsc` is the adapter for each
 * other caller; its request rules and its errors do not change.
 */
export async function commercialUcscFetch(request: UcscRequest, readUcsc: ApiFetchFn): Promise<UcscResult> {
  const refusal = commercialUcscRefusal(request);
  if (refusal) return refusal;
  return commercialUcscResult(request, await readUcsc(request));
}
