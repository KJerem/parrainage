// Montants en toutes lettres pour le reçu fiscal, selon l'orthographe traditionnelle : traits
// d'union sous cent, « et » devant un (sauf quatre-vingt-un), « vingts » et « cents » au pluriel
// en fin de nombre ou devant million et milliard, « mille » invariable.

const UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf",
] as const;

const TENS = [
  "",
  "",
  "vingt",
  "trente",
  "quarante",
  "cinquante",
  "soixante",
  "soixante",
  "quatre-vingt",
  "quatre-vingt",
] as const;

/** Plus grand entier écrit : 999 999 999 999. */
export const MAX_NUMBER_IN_WORDS = 999_999_999_999;

/** `final` : le groupe termine le nombre ou précède un nom (million, milliard). */
function belowHundred(n: number, final: boolean): string {
  if (n < 20) {
    return UNITS[n]!;
  }
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  // 70 à 79 et 90 à 99 : soixante-dix, soixante et onze, quatre-vingt-dix…
  if (ten === 7 || ten === 9) {
    return `${TENS[ten]}${ten === 7 && unit === 1 ? " et " : "-"}${UNITS[10 + unit]}`;
  }
  if (unit === 0) {
    return ten === 8 && final ? "quatre-vingts" : TENS[ten]!;
  }
  if (unit === 1 && ten !== 8) {
    return `${TENS[ten]} et un`;
  }
  return `${TENS[ten]}-${UNITS[unit]}`;
}

function belowThousand(n: number, final: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) {
    return belowHundred(rest, final);
  }
  const head = hundreds === 1 ? "cent" : `${UNITS[hundreds]} cent${rest === 0 && final ? "s" : ""}`;
  return rest === 0 ? head : `${head} ${belowHundred(rest, final)}`;
}

/** 1990 → « mille neuf cent quatre-vingt-dix ». */
export function numberToWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_NUMBER_IN_WORDS) {
    throw new RangeError(`Nombre hors limites : ${n}`);
  }
  if (n === 0) {
    return UNITS[0];
  }
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor(n / 1_000_000) % 1000;
  const thousands = Math.floor(n / 1000) % 1000;
  const rest = n % 1000;
  const parts: string[] = [];
  if (billions > 0) {
    parts.push(`${belowThousand(billions, true)} milliard${billions > 1 ? "s" : ""}`);
  }
  if (millions > 0) {
    parts.push(`${belowThousand(millions, true)} million${millions > 1 ? "s" : ""}`);
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? "mille" : `${belowThousand(thousands, false)} mille`);
  }
  if (rest > 0) {
    parts.push(belowThousand(rest, true));
  }
  return parts.join(" ");
}

/** 40 050 centimes → « quatre cents euros et cinquante centimes ». */
export function amountInWords(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(`Montant invalide : ${cents}`);
  }
  const euros = Math.floor(cents / 100);
  const centimes = cents % 100;
  const parts: string[] = [];
  if (euros > 0 || centimes === 0) {
    // « un million d'euros », mais « un million cent euros ».
    const unit =
      euros >= 1_000_000 && euros % 1_000_000 === 0 ? "d'euros" : euros > 1 ? "euros" : "euro";
    parts.push(`${numberToWords(euros)} ${unit}`);
  }
  if (centimes > 0) {
    parts.push(`${numberToWords(centimes)} centime${centimes > 1 ? "s" : ""}`);
  }
  return parts.join(" et ");
}
