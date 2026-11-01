import { minimalPdf } from "./pdf.js";

describe("minimalPdf", () => {
  const pdf = minimalPdf("Bulletin (test)", [
    { text: "Bulletin du 1er trimestre", size: 20, bold: true },
    { text: "Aïcha S. · CM2 · moyenne 13,4 / 20 (rang 5)" },
  ]);
  const text = pdf.toString("latin1");

  it("commence par l'en-tête PDF et finit par %%EOF", () => {
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.endsWith("%%EOF\n")).toBe(true);
  });

  it("pointe chaque objet au bon octet dans la table xref", () => {
    const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF/)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const entries = text.slice(startxref).match(/^(\d{10}) 00000 n $/gm)!;
    expect(entries).toHaveLength(7);
    entries.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
  });

  it("déclare la longueur exacte du flux de contenu", () => {
    const [, length, stream] = text.match(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/)!;
    expect(Buffer.byteLength(stream!, "latin1")).toBe(Number(length));
  });

  it("encode les accents en Latin-1 et échappe les parenthèses", () => {
    expect(pdf.includes(Buffer.from("Aïcha S. · CM2", "latin1"))).toBe(true);
    expect(text).toContain("\\(rang 5\\)");
    expect(text).toContain("/Title (Bulletin \\(test\\))");
  });

  it("refuse un caractère hors Latin-1", () => {
    expect(() => minimalPdf("x", [{ text: "Bulletin T1 — 2026-27" }])).toThrow(/hors Latin-1/);
  });
});
