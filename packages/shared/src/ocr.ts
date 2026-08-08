import type { ParsedCardText } from './types.js';

/**
 * Turn raw OCR text off a card photo into the few fields that actually
 * identify a card: name, collector number, printed set total, set code.
 *
 * OCR on a glossy holo is noisy, so nothing here is trusted on its own — the
 * matcher scores every extracted signal against the catalog and lets the user
 * confirm. The job of this module is to surface signals, not to decide.
 */

/** "004/165", "4 / 165" — the dominant modern format. */
const NUMERIC_FRACTION = /\b(\d{1,3})\s*[/\\|]\s*(\d{1,3})\b/;

/** "TG12/TG30", "GG01/GG70", "H14/H32" — subset numbering. */
const ALPHA_FRACTION = /\b([A-Z]{1,3}\d{1,3})\s*[/\\|]\s*[A-Z]{1,3}\d{1,3}\b/i;

/** Standalone promo numbering: "SWSH284", "SVP049", "XY182". */
const PROMO_NUMBER = /\b(SWSH|SVP|SM|XY|BW|DP|HGSS)\s?-?\s?(\d{2,3})\b/i;

/** Modern copyright line: "SVI EN 004", "PAL·EN·123". */
const SET_CODE_LINE = /\b([A-Z]{2,4})\s*[·.\-]?\s*EN\b/;

const FIRST_EDITION = /1\s?st\s?edition|1st\s?ed\b/i;

/**
 * Lines that are never a card name. Rules text, ability headers, the energy
 * cost column, legal footers — all of it reliably OCRs and would otherwise
 * out-rank the real name on a blurry scan.
 */
const NOISE_PATTERNS: RegExp[] = [
  /^(basic|stage\s*[12]|restored|level[\s-]?up|v[- ]?union)$/i,
  /\b(ability|ancient trait|pok[eé]?[- ]?body|pok[eé]?[- ]?power|vstar power)\b/i,
  /\b(weakness|resistance|retreat|illus|illustrat)/i,
  /\b(nintendo|creatures|game\s*freak|©|\(c\)|tm|®)\b/i,
  /\b(put (this|these)|attach|search your deck|discard|shuffle|your opponent|prize card)\b/i,
  /^\d[\d\s/]*$/,
  /^[^a-z]*$/i,
];

const NAME_SUFFIX_NOISE = /\s+(hp|h\s?p)\s*\d{0,3}\s*$/i;
const LEADING_JUNK = /^[^a-z]+/i;
const TRAILING_JUNK = /[^a-z0-9)]+$/i;

export function normalizeLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/**
 * Card names keep their suffixes ("ex", "V", "VMAX", "GX") because those are
 * part of the catalog name and a strong disambiguator.
 */
function cleanNameCandidate(line: string): string {
  return line
    .replace(NAME_SUFFIX_NOISE, '')
    .replace(LEADING_JUNK, '')
    .replace(TRAILING_JUNK, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeName(line: string): boolean {
  if (line.length < 3 || line.length > 32) return false;
  const letters = (line.match(/[a-z]/gi) ?? []).length;
  if (letters < 3) return false;
  // Mostly-letters: names are words, rules text fragments carry digits/symbols.
  if (letters / line.length < 0.6) return false;
  return !NOISE_PATTERNS.some((pattern) => pattern.test(line));
}

/** Every plausible name, best first — the matcher scores all of them. */
export function nameCandidates(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const cleaned = cleanNameCandidate(line);
    if (!looksLikeName(cleaned)) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

export function parseCardText(raw: string): ParsedCardText {
  const lines = normalizeLines(raw);
  const joined = lines.join('\n');

  let number: string | null = null;
  let printedTotal: number | null = null;

  const alpha = joined.match(ALPHA_FRACTION);
  if (alpha?.[1]) {
    number = alpha[1].toUpperCase();
  }

  const numeric = joined.match(NUMERIC_FRACTION);
  if (numeric?.[1] && numeric[2]) {
    // Strip OCR-preserved leading zeros: the catalog stores "4", not "004".
    if (!number) number = String(parseInt(numeric[1], 10));
    printedTotal = parseInt(numeric[2], 10);
  }

  if (!number) {
    const promo = joined.match(PROMO_NUMBER);
    if (promo?.[1] && promo[2]) number = `${promo[1].toUpperCase()}${promo[2]}`;
  }

  const setCodeMatch = joined.match(SET_CODE_LINE);
  const setCode = setCodeMatch?.[1] ? setCodeMatch[1].toUpperCase() : null;

  const candidates = nameCandidates(lines);

  return {
    name: candidates[0] ?? null,
    number,
    printedTotal,
    setCode,
    firstEdition: FIRST_EDITION.test(joined),
    lines: candidates,
  };
}
