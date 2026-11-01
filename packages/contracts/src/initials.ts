const LETTER = /\p{L}/u;

/**
 * Initiales affichées dans les avatars : première lettre du premier et du dernier mot.
 * « Claire M. » → « CM », « M. Koffi » → « MK », « Bureau · trésorerie » → « BT ».
 */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => word.match(LETTER)?.[0])
    .filter((letter): letter is string => letter !== undefined);
  if (letters.length === 0) {
    return "?";
  }
  const picked = letters.length === 1 ? letters : [letters[0]!, letters[letters.length - 1]!];
  return picked.join("").toLocaleUpperCase("fr");
}
