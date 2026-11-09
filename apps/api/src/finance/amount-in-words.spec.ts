import { amountInWords, numberToWords } from "./amount-in-words.js";

describe("numberToWords", () => {
  it.each([
    [0, "zéro"],
    [1, "un"],
    [16, "seize"],
    [17, "dix-sept"],
    [20, "vingt"],
    [21, "vingt et un"],
    [22, "vingt-deux"],
    [31, "trente et un"],
    [61, "soixante et un"],
    [70, "soixante-dix"],
    [71, "soixante et onze"],
    [72, "soixante-douze"],
    [79, "soixante-dix-neuf"],
    [80, "quatre-vingts"],
    [81, "quatre-vingt-un"],
    [90, "quatre-vingt-dix"],
    [91, "quatre-vingt-onze"],
    [99, "quatre-vingt-dix-neuf"],
    [100, "cent"],
    [101, "cent un"],
    [180, "cent quatre-vingts"],
    [200, "deux cents"],
    [201, "deux cent un"],
    [290, "deux cent quatre-vingt-dix"],
    [300, "trois cents"],
    [356, "trois cent cinquante-six"],
    [1000, "mille"],
    [1001, "mille un"],
    [1990, "mille neuf cent quatre-vingt-dix"],
    [2000, "deux mille"],
    [21_000, "vingt et un mille"],
    [80_000, "quatre-vingt mille"],
    [200_000, "deux cent mille"],
    [280_080, "deux cent quatre-vingt mille quatre-vingts"],
    [1_000_000, "un million"],
    [2_000_000, "deux millions"],
    [80_000_000, "quatre-vingts millions"],
    [200_000_000, "deux cents millions"],
    [1_200_000_001, "un milliard deux cents millions un"],
  ])("%i → %s", (n, words) => {
    expect(numberToWords(n)).toBe(words);
  });

  it("refuse les nombres négatifs, décimaux ou trop grands", () => {
    expect(() => numberToWords(-1)).toThrow(RangeError);
    expect(() => numberToWords(1.5)).toThrow(RangeError);
    expect(() => numberToWords(1e12)).toThrow(RangeError);
  });
});

describe("amountInWords", () => {
  it.each([
    [0, "zéro euro"],
    [100, "un euro"],
    [200, "deux euros"],
    [40000, "quatre cents euros"],
    [30000, "trois cents euros"],
    [54000, "cinq cent quarante euros"],
    [35640, "trois cent cinquante-six euros et quarante centimes"],
    [40050, "quatre cents euros et cinquante centimes"],
    [101, "un euro et un centime"],
    [99, "quatre-vingt-dix-neuf centimes"],
    [100_000_000, "un million d'euros"],
    [100_010_000, "un million cent euros"],
  ])("%i centimes → %s", (cents, words) => {
    expect(amountInWords(cents)).toBe(words);
  });
});
