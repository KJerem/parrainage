// PDF d'une page écrit à la main (aucune dépendance) : polices standard Helvetica en
// WinAnsiEncoding, texte limité au Latin-1 (accents français, « · »).

export interface PdfLine {
  text: string;
  size?: number;
  bold?: boolean;
}

/** Échappe une chaîne littérale PDF et vérifie qu'elle tient en Latin-1. */
function pdfString(text: string): string {
  if ([...text].some((c) => c.codePointAt(0)! > 0xff)) {
    throw new Error(`Caractère hors Latin-1 dans le PDF : « ${text} »`);
  }
  return `(${text.replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

/** Document A4 d'une page, une ligne de texte par entrée, de haut en bas. */
export function minimalPdf(title: string, lines: readonly PdfLine[]): Buffer {
  let y = 780;
  const content = lines
    .map((line) => {
      const size = line.size ?? 12;
      y -= Math.round(size * 1.8);
      return `BT /${line.bold ? "F1" : "F2"} ${size} Tf 56 ${y} Td ${pdfString(line.text)} Tj ET`;
    })
    .join("\n");
  const stream = Buffer.from(content, "latin1");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
      "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${stream.length} >>\nstream\n${stream.toString("latin1")}\nendstream`,
    `<< /Title ${pdfString(title)} /Producer (Parrainage LRT) >>`,
  ];

  const chunks: Buffer[] = [];
  let length = 0;
  const push = (text: string) => {
    const chunk = Buffer.from(text, "latin1");
    chunks.push(chunk);
    length += chunk.length;
  };
  // Le commentaire binaire signale un fichier binaire aux outils de transfert.
  push("%PDF-1.4\n%âãÏÓ\n");
  const offsets = objects.map((body, index) => {
    const offset = length;
    push(`${index + 1} 0 obj\n${body}\nendobj\n`);
    return offset;
  });
  const xref = length;
  // Chaque entrée de la table xref fait exactement 20 octets.
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) {
    push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n` +
      `startxref\n${xref}\n%%EOF\n`,
  );
  return Buffer.concat(chunks);
}
