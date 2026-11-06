// Détecteur de coordonnées personnelles (plan §8), pur et partagé : l'API l'applique à chaque
// message, le web s'en sert pour prévenir avant l'envoi. Les positions renvoyées sont celles du
// texte d'origine (indices JavaScript), pour surligner ou masquer sans dangerouslySetInnerHTML.
import { z } from "zod";

export const alertTypes = [
  "PHONE",
  "EMAIL",
  "URL",
  "SOCIAL",
  "ADDRESS",
  "MONEY",
  "MEETING",
] as const;

export const alertTypeSchema = z.enum(alertTypes);

export type AlertType = z.infer<typeof alertTypeSchema>;

/** Libellés affichés au relecteur et dans l'avertissement avant envoi. */
export const alertTypeLabels: Readonly<Record<AlertType, string>> = {
  PHONE: "Numéro de téléphone",
  EMAIL: "Adresse e-mail",
  URL: "Lien internet",
  SOCIAL: "Réseau social ou pseudo",
  ADDRESS: "Adresse postale",
  MONEY: "Argent ou transfert",
  MEETING: "Proposition de rendez-vous",
};

export const alertSpanSchema = z.object({
  type: alertTypeSchema,
  /** Début du passage dans le texte d'origine (inclus). */
  start: z.number().int().nonnegative(),
  /** Fin du passage dans le texte d'origine (exclue). */
  end: z.number().int().nonnegative(),
});

export type AlertSpan = z.infer<typeof alertSpanSchema>;

export interface AlertDetection {
  /** Types détectés, sans doublon, dans l'ordre de `alertTypes`. */
  types: AlertType[];
  /** Passages concernés, triés par position. */
  spans: AlertSpan[];
}

// ─── Étape 1 : neutraliser (texte d'origine) ──────────────────────────────────
// Dates, notes, rangs, années scolaires et classes ne doivent pas se recoller à d'autres
// chiffres. Un motif collé à une autre suite de chiffres n'est pas neutralisé : « 06/39/98/12/34 »
// reste un numéro.

const SEP = String.raw`[\s.\-·/_()+–—]`;
const NOT_AFTER_DIGITS = String.raw`(?<!\d${SEP}{0,3})`;
const NOT_BEFORE_DIGITS = String.raw`(?!${SEP}{0,3}\d)`;
const isolated = (pattern: string) =>
  new RegExp(String.raw`${NOT_AFTER_DIGITS}\b(?:${pattern})\b${NOT_BEFORE_DIGITS}`, "gi");

const DAY = String.raw`(?:0?[1-9]|[12]\d|3[01])`;
const MONTH = String.raw`(?:0?[1-9]|1[0-2])`;

const NEUTRAL_PATTERNS: readonly RegExp[] = [
  // 31/10/2026, 31.10.26, 5/11
  isolated(String.raw`${DAY}\s?[/.\-]\s?${MONTH}(?:\s?[/.\-]\s?(?:\d{4}|\d{2}))?`),
  // 2026-10-31
  isolated(String.raw`(?:19|20)\d{2}-${MONTH}-${DAY}`),
  // 13,4 / 20 · 5 / 48 · 5e/48
  isolated(
    String.raw`\d{1,3}(?:[,.]\d{1,2})?\s{0,2}(?:e|er|re|ère|ème|eme)?\s{0,2}/\s{0,2}\d{1,3}`,
  ),
  // 2026-2027, 2026-27, 2026/2027
  isolated(String.raw`(?:19|20)\d{2}\s?[-–/]\s?(?:(?:19|20)\d{2}|\d{2})`),
  // CP1, CE2, CM2, 6e, 5ème, 2nde, 1re, Tle
  /\b(?:(?:CP|CE|CM)\s?[12]|[3-6]\s?(?:e|ème|eme)|2nde|1re|1ère|Tle)\b/gi,
];

// Caractère privé (U+E000) qui remplace chaque caractère neutralisé : les positions d'origine
// sont conservées et une suite de chiffres ne se recolle pas à travers le passage.
const NEUTRAL = "\uE000";

function neutralise(text: string): string {
  const chars = text.split("");
  for (const pattern of NEUTRAL_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      for (let i = match.index; i < match.index + match[0].length; i += 1) {
        chars[i] = NEUTRAL;
      }
    }
  }
  return chars.join("");
}

// ─── Étape 2 : normaliser, avec la table des positions d'origine ─────────────

interface Normalized {
  text: string;
  /** Position d'origine (début, fin) de chaque caractère du texte normalisé. */
  starts: number[];
  ends: number[];
}

const APOSTROPHES = new Set(["’", "‘", "ʼ", "`", "´"]);

/** Minuscules, NFKD sans diacritiques, apostrophes unifiées ; un code point à la fois. */
function normalize(source: string): Normalized {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < source.length;) {
    const codePoint = source.codePointAt(i)!;
    const length = codePoint > 0xffff ? 2 : 1;
    const char = source.slice(i, i + length);
    const out = APOSTROPHES.has(char)
      ? "'"
      : char.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
    if (out === "" && ends.length > 0) {
      // Signe combinant isolé (accent décomposé, sélecteur d'emoji, touche « 6️⃣ ») : il
      // appartient au caractère précédent.
      ends[ends.length - 1] = i + length;
    }
    for (let k = 0; k < out.length; k += 1) {
      starts.push(i);
      ends.push(i + length);
    }
    text += out;
    i += length;
  }
  return { text, starts, ends };
}

// ─── Étape 3 : repérer ────────────────────────────────────────────────────────

interface RawSpan {
  type: AlertType;
  /** Positions dans le texte normalisé. */
  start: number;
  end: number;
}

// Suites de chiffres (et de nombres écrits en lettres) recollées à travers les séparateurs.

type Token =
  | { kind: "digits"; value: string; start: number; end: number }
  | { kind: "word"; word: string; start: number; end: number }
  | { kind: "sep"; value: string; start: number; end: number }
  | { kind: "break"; start: number; end: number };

const SEPARATOR_CHAR = /[\s.,\-·/_()+–—]/;
/** Au-delà, deux groupes de chiffres ne sont plus considérés comme un seul numéro. */
const MAX_SEPARATOR_LENGTH = 3;
/** Une suite d'au moins 8 chiffres est traitée comme un numéro (téléphone, compte…). */
const MIN_PHONE_DIGITS = 8;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const start = i;
    const char = text[i]!;
    if (char >= "0" && char <= "9") {
      while (i < text.length && text[i]! >= "0" && text[i]! <= "9") i += 1;
      tokens.push({ kind: "digits", value: text.slice(start, i), start, end: i });
    } else if (char >= "a" && char <= "z") {
      while (i < text.length && text[i]! >= "a" && text[i]! <= "z") i += 1;
      tokens.push({ kind: "word", word: text.slice(start, i), start, end: i });
    } else if (SEPARATOR_CHAR.test(char)) {
      while (i < text.length && SEPARATOR_CHAR.test(text[i]!)) i += 1;
      tokens.push({ kind: "sep", value: text.slice(start, i), start, end: i });
    } else {
      i += 1;
      tokens.push({ kind: "break", start, end: i });
    }
  }
  return tokens;
}

const UNITS: Readonly<Record<string, number>> = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
};
const TEENS: Readonly<Record<string, number>> = {
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
};
const TENS: Readonly<Record<string, number>> = {
  vingt: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
};

/** Séparateur court sans virgule : « 06 39 », « 06.39 », « trente-neuf ». */
const isShortSep = (token: Token | undefined) =>
  token?.kind === "sep" &&
  token.end - token.start <= MAX_SEPARATOR_LENGTH &&
  !token.value.includes(",");

/**
 * Séparateur entre deux groupes d'un même numéro. Une virgule ne recolle que des chiffres
 * collés (« 06,39,98 »), des nombres en lettres (« zéro six, trente-neuf ») ou des paires à la
 * française qui commencent par 0 (« 06, 39, 98 ») : une liste de notes « 12, 15, 18, 20 » reste
 * une liste.
 */
function joinsGroups(token: Token, besideWords: boolean, frenchPairs: boolean): boolean {
  if (token.kind !== "sep" || token.end - token.start > MAX_SEPARATOR_LENGTH) {
    return false;
  }
  if (!token.value.includes(",")) {
    return true;
  }
  return token.value === "," || ((besideWords || frenchPairs) && /^,\s?$/.test(token.value));
}

/** Mots consécutifs (séparés par un espace ou un trait d'union) à partir du jeton `index`. */
function wordsFrom(tokens: readonly Token[], index: number): { word: string; index: number }[] {
  const words: { word: string; index: number }[] = [];
  let i = index;
  while (words.length < 6) {
    const token = tokens[i];
    if (token?.kind !== "word") break;
    words.push({ word: token.word, index: i });
    if (!isShortSep(tokens[i + 1]) || tokens[i + 2]?.kind !== "word") break;
    i += 2;
  }
  return words;
}

/** Un nombre de 0 à 99 écrit en lettres, en tête de `words` : sa valeur et le nombre de mots lus. */
function parseNumberWords(words: readonly string[]): { value: number; used: number } | null {
  const [first, second] = words;
  if (first === undefined) return null;
  let base: number | null = null;
  let used = 0;
  if (first === "quatre" && (second === "vingt" || second === "vingts")) {
    base = 80;
    used = 2;
  } else if (TENS[first] !== undefined) {
    base = TENS[first]!;
    used = 1;
  }
  if (base !== null) {
    let next = words[used];
    let withEt = false;
    if (next === "et") {
      withEt = true;
      next = words[used + 1];
    }
    const skip = withEt ? 1 : 0;
    if (next !== undefined && (base === 60 || base === 80)) {
      if (next === "dix" && ["sept", "huit", "neuf"].includes(words[used + skip + 1] ?? "")) {
        return { value: base + 10 + UNITS[words[used + skip + 1]!]!, used: used + skip + 2 };
      }
      if (TEENS[next] !== undefined) {
        return { value: base + TEENS[next]!, used: used + skip + 1 };
      }
    }
    if (next !== undefined && UNITS[next] !== undefined && UNITS[next]! > 0) {
      return { value: base + UNITS[next]!, used: used + skip + 1 };
    }
    return { value: base, used };
  }
  if (first === "dix" && ["sept", "huit", "neuf"].includes(second ?? "")) {
    return { value: 10 + UNITS[second!]!, used: 2 };
  }
  if (TEENS[first] !== undefined) return { value: TEENS[first]!, used: 1 };
  if (UNITS[first] !== undefined) return { value: UNITS[first]!, used: 1 };
  return null;
}

interface NumberPart {
  digits: string;
  /** Écrit en lettres (« trente-neuf »). */
  words: boolean;
  /** Jeton suivant le groupe. */
  next: number;
  start: number;
  end: number;
}

/** Groupe de chiffres (ou nombre en lettres) au jeton `index` : ses chiffres et la suite. */
function readNumber(tokens: readonly Token[], index: number): NumberPart | null {
  const token = tokens[index];
  if (token?.kind === "digits") {
    return {
      digits: token.value,
      words: false,
      next: index + 1,
      start: token.start,
      end: token.end,
    };
  }
  if (token?.kind !== "word") return null;
  const words = wordsFrom(tokens, index);
  const parsed = parseNumberWords(words.map((w) => w.word));
  if (!parsed) return null;
  const last = tokens[words[parsed.used - 1]!.index]!;
  return {
    digits: String(parsed.value),
    words: true,
    next: words[parsed.used - 1]!.index + 1,
    start: token.start,
    end: last.end,
  };
}

const isPair = (part: NumberPart) => !part.words && part.digits.length === 2;

/** Groupe suivant du même numéro, juste après `last` ou après un séparateur qui les relie. */
function nextPart(
  tokens: readonly Token[],
  first: NumberPart,
  last: NumberPart,
): NumberPart | null {
  const separator = tokens[last.next];
  if (separator?.kind !== "sep") {
    return readNumber(tokens, last.next);
  }
  const candidate = readNumber(tokens, last.next + 1);
  if (!candidate) {
    return null;
  }
  const frenchPairs =
    isPair(first) && first.digits.startsWith("0") && isPair(last) && isPair(candidate);
  return joinsGroups(separator, last.words || candidate.words, frenchPairs) ? candidate : null;
}

/** « 10 000 000 FCFA », « 12.500.000 F » : une somme en milliers, pas un numéro. */
const THOUSANDS = /^\d{1,3}(?:[ .]\d{3})+$/;
const CURRENCY_AFTER =
  /^\s?(?:f\s?cfa|cfa|fcfa|xof|f|francs?|euros?|eur|€|\$|dollars?|usd)(?![a-z])/;

function isAmount(text: string, parts: readonly NumberPart[]): boolean {
  if (parts.some((p) => p.words)) {
    return false;
  }
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  return (
    THOUSANDS.test(text.slice(first.start, last.end)) &&
    CURRENCY_AFTER.test(text.slice(last.end, last.end + 12))
  );
}

function detectDigitRuns(text: string): RawSpan[] {
  const tokens = tokenize(text);
  const spans: RawSpan[] = [];
  let i = 0;
  while (i < tokens.length) {
    const first = readNumber(tokens, i);
    if (!first) {
      i += 1;
      continue;
    }
    const parts = [first];
    for (let more = nextPart(tokens, first, first); more; more = nextPart(tokens, first, more)) {
      parts.push(more);
    }
    // « un 06 39… » : l'article n'appartient pas au numéro.
    const head = tokens[i];
    if (parts.length > 1 && head?.kind === "word" && (head.word === "un" || head.word === "une")) {
      parts.shift();
    }
    const digits = parts.map((p) => p.digits).join("");
    if (digits.length >= MIN_PHONE_DIGITS && !isAmount(text, parts)) {
      const begin = parts[0]!.start;
      const start = text[begin - 1] === "+" ? begin - 1 : begin;
      spans.push({ type: "PHONE", start, end: parts[parts.length - 1]!.end });
    }
    const next = parts[parts.length - 1]!.next;
    i = next;
  }
  return spans;
}

// Motifs sur le texte normalisé (minuscules, sans accents).

const DOT = String.raw`(?:\s*(?:\(dot\)|\[dot\]|\(point\)|\[point\])\s*|\s+(?:point|dot)\s+|\s?\.\s?)`;
const AT = String.raw`(?:\s*(?:\(at\)|\[at\]|\{at\}|<at>|\(arobase\))\s*|\s+(?:arobase|arrobase|at)\s+|\s?@\s?)`;
const LOCAL = String.raw`[a-z0-9][a-z0-9_%+\-]*(?:${DOT}[a-z0-9_%+\-]+){0,4}`;
const DOMAIN = String.raw`[a-z0-9\-]+(?:${DOT}[a-z0-9\-]+){0,3}${DOT}[a-z]{2,10}\b`;
const TLD = "(?:com|fr|tg|net|org|io|info|be|ch)";
const SPACED_NETWORKS = [
  "whatsapp",
  "instagram",
  "snapchat",
  "facebook",
  "telegram",
  "tiktok",
  "messenger",
  "discord",
]
  .map((name) => [...name].join(String.raw`[\s.\-_*]+`))
  .join("|");

const PATTERNS: readonly { type: AlertType; pattern: RegExp }[] = [
  // Téléphone annoncé en toutes lettres (« mon numéro », « appelle-moi »).
  {
    type: "PHONE",
    pattern:
      /\b(?:(?:mon|ton|ma|ta|votre|notre)\s+(?:numero|num|tel|telephone|portable|mobile|phone)|(?:appelle|appelez|appeler|telephone|textote|bipe)[\s-]?(?:moi|nous)|sms|texto)\b/g,
  },
  { type: "EMAIL", pattern: new RegExp(`${LOCAL}${AT}${DOMAIN}`, "g") },
  {
    type: "EMAIL",
    pattern:
      /\b(?:arobase|arrobase|gmail|hotmail|yahoo|outlook|icloud|protonmail|wanadoo|(?:mon|ton|ma|ta|votre)\s+(?:adresse\s+)?e?-?mail)\b/g,
  },
  { type: "URL", pattern: /\b(?:https?:\/\/|www\.)[^\s<>"']+/g },
  {
    type: "URL",
    pattern: new RegExp(
      String.raw`\b[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)*\.${TLD}\b(?:/[^\s<>"']*)?`,
      "g",
    ),
  },
  {
    type: "URL",
    pattern: new RegExp(String.raw`\b[a-z0-9\-]+\s+(?:point|dot)\s+${TLD}\b`, "g"),
  },
  // Domaine espacé pour échapper au repérage : « monsite . com », « monsite. fr ».
  { type: "URL", pattern: /\b[a-z0-9\-]{2,}(?:\s\.\s?|\.\s)(?:com|fr|tg|net|org|io)\b/g },
  {
    type: "SOCIAL",
    pattern:
      /\b(?:whats\s?app|whatsap|watsapp|watsap|wathsapp|watsup|wa\.me|insta(?:gram)?|snap(?:chat)?|facebook|fb|messenger|tik\s?tok|telegram|discord|twitter|youtube|viber|skype|imo)\b/g,
  },
  // Lettres séparées : « W h a t s a p p », « i.n.s.t.a.g.r.a.m ».
  { type: "SOCIAL", pattern: new RegExp(String.raw`\b(?:${SPACED_NETWORKS})\b`, "g") },
  { type: "SOCIAL", pattern: /\b(?:sur|via|par|appli(?:cation)?)\s+signal\b/g },
  // Pseudo « @aicha_s » (une adresse e-mail est détectée à part).
  { type: "SOCIAL", pattern: /(?<![a-z0-9._%+\-])@[a-z0-9_.]{2,30}/g },
  {
    type: "ADDRESS",
    pattern:
      /\b\d{1,4}(?:\s?(?:bis|ter))?\s?,?\s(?:rue|avenue|av|bd|boulevard|chemin|impasse|allee|place|route|quai|square|lotissement|residence)\b(?:\s+[a-z'\-]+){0,3}/g,
  },
  // Numéro après la voie : « avenue de la Libération 5 ».
  {
    type: "ADDRESS",
    pattern:
      /\b(?:rue|avenue|bd|boulevard|impasse|chemin)\s+(?:de\s+la\s+|de\s+l'|du\s+|des\s+|de\s+)?[a-z'\-]+\s+\d{1,4}\b/g,
  },
  { type: "ADDRESS", pattern: /\bb\.?\s?p\.?\s?\d{1,6}\b/g },
  {
    type: "ADDRESS",
    pattern:
      /(?<![0-9][\s.\-·/_()+]{0,3})\b\d{5}\b(?![\s.\-·/_()+]{0,3}[0-9])\s+(?!(?:fcfa|cfa|f|francs?|euros?|eur|e|km|m|metres|habitants|personnes|eleves|enfants|ans|points?)\b)[a-z]{2,}/g,
  },
  {
    type: "ADDRESS",
    pattern: /\b(?:mon|ma|ton|ta|votre|notre)\s+adresse\b(?!\s+(?:e-?mail|mail|electronique))/g,
  },
  {
    type: "MONEY",
    pattern:
      /\b(?:western\s?union|money\s?gram|t-?\s?money|flooz|mobile\s?money|moov\s?money|orange\s?money|mtn\s?money|paypal|lydia|wari|iban|cash\s?plus)\b/g,
  },
  {
    type: "MONEY",
    pattern:
      /\b(?:envoi|envoie|envoies|envoyer|envoye|envoyes|envoyez|donne|donner|donnes|donnez|transfere|transferer|virer|vire|prete|preter|besoin)\b[^.!?\n]{0,30}?\b(?:argent|des\s+sous|fric)\b/g,
  },
  // Somme demandée : « envoie-moi 5000 », « donne-moi 10 euros » (mais pas « envoie-moi 2 photos »).
  {
    type: "MONEY",
    pattern:
      /\b(?:envoie|envoies|envoyez|donne|donnes|donnez|prete|pretez|vire|virez|transfere)[\s-]+(?:moi|nous)\s+(?:\d(?:[\s.]?\d){2,}|\d+\s*(?:(?:f|fcfa|cfa|francs?|euros?|eur)\b|€))/g,
  },
  {
    type: "MEETING",
    pattern:
      /\b(?:viens|venez|venir|viendrai[st]?|viendrons|viendra|rendez-?\s?vous|rdv|se\s+voir|se\s+voit|(?:te|vous|se|nous)\s+(?:retrouver|rencontrer|rejoindre)|on\s+se\s+retrouve)\b[^.!?\n]{0,40}?\b(?:chez|maison|adresse|domicile|en\s+cachette|en\s+secret)\b/g,
  },
];

const overlaps = (a: RawSpan, b: RawSpan) => a.start < b.end && b.start < a.end;

/** Fusionne les passages d'un même type qui se chevauchent ou se touchent. */
function mergeSpans(spans: readonly RawSpan[]): RawSpan[] {
  const sorted = [...spans].sort(
    (a, b) => a.start - b.start || alertTypes.indexOf(a.type) - alertTypes.indexOf(b.type),
  );
  const merged: RawSpan[] = [];
  for (const span of sorted) {
    const previous = merged.findLast((m) => m.type === span.type && span.start <= m.end);
    if (previous) {
      previous.end = Math.max(previous.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged.sort(
    (a, b) => a.start - b.start || alertTypes.indexOf(a.type) - alertTypes.indexOf(b.type),
  );
}

/**
 * Détecte numéros de téléphone (y compris en lettres), e-mails, liens, réseaux sociaux,
 * adresses, argent et propositions de rendez-vous. Un faux positif ne bloque rien : le message
 * part en relecture comme les autres, l'alerte aide seulement le relecteur.
 */
export function detectAlerts(text: string): AlertDetection {
  const normalized = normalize(neutralise(text));
  const raw: RawSpan[] = detectDigitRuns(normalized.text);
  for (const { type, pattern } of PATTERNS) {
    for (const match of normalized.text.matchAll(pattern)) {
      const value = match[0].trimEnd();
      if (value.length > 0) {
        raw.push({ type, start: match.index, end: match.index + value.length });
      }
    }
  }
  // Le domaine d'une adresse e-mail n'est pas un lien, et son « @ » n'est pas un pseudo.
  const emails = raw.filter((s) => s.type === "EMAIL");
  const kept = raw.filter(
    (s) => (s.type !== "URL" && s.type !== "SOCIAL") || !emails.some((e) => overlaps(e, s)),
  );
  const spans = mergeSpans(kept).map((s) => ({
    type: s.type,
    start: normalized.starts[s.start]!,
    end: normalized.ends[s.end - 1]!,
  }));
  const found = new Set(spans.map((s) => s.type));
  return { types: alertTypes.filter((t) => found.has(t)), spans };
}
