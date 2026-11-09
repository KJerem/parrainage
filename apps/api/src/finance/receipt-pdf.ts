import { type PDFFont, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { PaymentMethod } from "../generated/prisma/enums.js";
import { amountInWords } from "./amount-in-words.js";

/** Mentions de l'association imprimées sur ses reçus (variables ASSOCIATION_*). */
export interface AssociationIdentity {
  name: string;
  /** Adresse du siège, lignes séparées par « \n » ; vide : non imprimée. */
  address: string;
  object: string;
  signatory: string;
}

/** Reçu tel qu'émis : rien n'est recalculé au téléchargement. */
export interface ReceiptData {
  number: string;
  year: number;
  amountCents: number;
  paymentCount: number;
  methods: readonly PaymentMethod[];
  donorName: string;
  donorAddress: string | null;
  issuedAt: Date;
  ratePercent: number;
}

const METHOD_ORDER: readonly PaymentMethod[] = ["SEPA_DEBIT", "CARD", "TRANSFER", "CHEQUE"];

const methodWords: Record<PaymentMethod, string> = {
  SEPA_DEBIT: "prélèvement",
  CARD: "carte bancaire",
  TRANSFER: "virement",
  CHEQUE: "chèque",
};

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** « 400,00 € », espaces insécables du Latin-1 (les polices standard n'ont pas U+202F). */
export function formatReceiptAmount(cents: number): string {
  return euros.format(cents / 100).replace(/[  ]/g, " ");
}

const longDate = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

/** « 15 janvier 2026 », « 1er février 2026 ». */
export function receiptDate(date: Date): string {
  return longDate.format(date).replace(/^1 /, "1er ");
}

export interface ReceiptText {
  title: string;
  legalBasis: string;
  number: string;
  beneficiary: string[];
  donor: string[];
  acknowledgement: string;
  amount: string;
  amountInWords: string;
  details: string[];
  taxNote: string;
  signature: string[];
  footer: string;
}

const lines = (text: string | null) =>
  (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

/** Textes du reçu, dans l'ordre de la page (modèle du Cerfa n° 11580). */
export function receiptText(data: ReceiptData, association: AssociationIdentity): ReceiptText {
  const methods = METHOD_ORDER.filter((method) => data.methods.includes(method)).map(
    (method) => methodWords[method],
  );
  const count = `${data.paymentCount} versement${data.paymentCount > 1 ? "s" : ""}`;
  return {
    title: "Reçu au titre des dons à certains organismes d'intérêt général",
    legalBasis: "Article 200 du code général des impôts",
    number: `Reçu n° ${data.number}`,
    beneficiary: [
      association.name,
      ...lines(association.address),
      ...(association.object ? [`Objet : ${association.object}`] : []),
    ],
    donor: [data.donorName, ...lines(data.donorAddress)],
    acknowledgement:
      "Le bénéficiaire reconnaît avoir reçu, au titre des dons et versements ouvrant droit à " +
      "réduction d'impôt, la somme de :",
    amount: formatReceiptAmount(data.amountCents),
    amountInWords: `Somme en toutes lettres : ${amountInWords(data.amountCents)}`,
    details: [
      `Versements reçus du 1er janvier au 31 décembre ${data.year} (reçu récapitulatif, ${count})`,
      "Forme du don : déclaration de don manuel",
      "Nature du don : numéraire",
      ...(methods.length > 0 ? [`Mode de versement : ${methods.join(", ")}`] : []),
    ],
    taxNote:
      `Ces versements ouvrent droit à une réduction d'impôt sur le revenu égale à ` +
      `${data.ratePercent} % de leur montant, dans la limite de 20 % du revenu imposable.`,
    signature: [`Le ${receiptDate(data.issuedAt)}`, association.signatory],
    footer: "Versements simulés par la plateforme Parrainage LRT : exemplaire de démonstration.",
  };
}

const INK = rgb(0x17 / 255, 0x20 / 255, 0x1d / 255);
const MUTED = rgb(0x5a / 255, 0x66 / 255, 0x62 / 255);
const BRAND = rgb(0x1e / 255, 0x5c / 255, 0x4e / 255);
const LINE = rgb(0xe1 / 255, 0xe6 / 255, 0xe4 / 255);

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

/** Remplace ce que la police standard (WinAnsi) ne sait pas écrire : « Ł » → « L », sinon « ? ». */
function encodable(font: PDFFont): (text: string) => string {
  const supported = new Set(font.getCharacterSet());
  return (text) =>
    [...text]
      .map((char) => {
        if (supported.has(char.codePointAt(0)!)) {
          return char;
        }
        const base = char.normalize("NFD").replace(/\p{M}/gu, "");
        return [...base].every((c) => supported.has(c.codePointAt(0)!)) && base !== ""
          ? base
          : char === "Ł"
            ? "L"
            : char === "ł"
              ? "l"
              : "?";
      })
      .join("");
}

/** Coupe un texte sur les espaces ordinaires (les insécables tiennent ensemble). */
function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const next = current === "" ? word : `${current} ${word}`;
    if (current !== "" && font.widthOfTextAtSize(next, size) > width) {
      out.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current !== "") {
    out.push(current);
  }
  return out;
}

/** Le reçu en PDF A4. Même reçu, mêmes octets : les dates du document sont celles de l'émission. */
export async function receiptPdf(
  data: ReceiptData,
  association: AssociationIdentity,
): Promise<Uint8Array> {
  const text = receiptText(data, association);
  const document = await PDFDocument.create({ updateMetadata: false });
  document.setTitle(`Reçu fiscal ${data.year} n° ${data.number}`);
  document.setSubject(text.amountInWords);
  document.setAuthor(association.name);
  document.setCreator("Parrainage LRT");
  document.setProducer("Parrainage LRT");
  document.setLanguage("fr-FR");
  document.setCreationDate(data.issuedAt);
  document.setModificationDate(data.issuedAt);

  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const safe = encodable(regular);
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const write = (
    value: string,
    options: { font?: PDFFont; size?: number; color?: typeof INK; x?: number; width?: number } = {},
  ) => {
    const font = options.font ?? regular;
    const size = options.size ?? 10.5;
    const x = options.x ?? MARGIN;
    for (const line of wrap(
      font,
      safe(value),
      size,
      options.width ?? CONTENT_WIDTH - (x - MARGIN),
    )) {
      page.drawText(line, { x, y: y - size, size, font, color: options.color ?? INK });
      y -= size * 1.45;
    }
  };
  const space = (points: number) => {
    y -= points;
  };

  // En-tête : l'association à gauche, le numéro à droite.
  const numberSize = 11;
  const numberText = safe(text.number);
  page.drawText(numberText, {
    x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(numberText, numberSize),
    y: y - numberSize,
    size: numberSize,
    font: bold,
    color: INK,
  });
  write(text.beneficiary[0]!, { font: bold, size: 15, color: BRAND, width: CONTENT_WIDTH - 150 });
  for (const line of lines(association.address)) {
    write(line, { size: 9.5, color: MUTED });
  }
  space(12);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: LINE,
  });
  space(22);

  write(text.title, { font: bold, size: 16 });
  write(text.legalBasis, { size: 10, color: MUTED });
  space(16);

  const section = (heading: string, content: readonly string[]) => {
    write(heading, { font: bold, size: 11, color: BRAND });
    space(2);
    for (const line of content) {
      write(line);
    }
    space(12);
  };
  section("Bénéficiaire des versements", text.beneficiary);
  section("Donateur", text.donor);

  write(text.acknowledgement);
  space(4);
  write(text.amount, { font: bold, size: 22 });
  space(2);
  write(text.amountInWords, { size: 11 });
  space(10);
  for (const detail of text.details) {
    write(detail);
  }
  space(14);
  write(text.taxNote, { size: 9.5, color: MUTED });
  space(28);

  const signatureX = MARGIN + CONTENT_WIDTH / 2;
  write(text.signature[0]!, { x: signatureX });
  write(text.signature[1]!, { x: signatureX, font: bold });

  const footerSize = 8.5;
  const footer = safe(text.footer);
  page.drawText(footer, {
    x: (PAGE_WIDTH - regular.widthOfTextAtSize(footer, footerSize)) / 2,
    y: 36,
    size: footerSize,
    font: regular,
    color: MUTED,
  });

  return document.save();
}
