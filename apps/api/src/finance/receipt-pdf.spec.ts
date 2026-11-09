import { PDFDocument } from "pdf-lib";
import {
  type AssociationIdentity,
  formatReceiptAmount,
  type ReceiptData,
  receiptDate,
  receiptPdf,
  receiptText,
} from "./receipt-pdf.js";

const association: AssociationIdentity = {
  name: "Association LRT",
  address: "4 rue de l'Exemple\n69001 Lyon",
  object: "Soutien à la scolarité d'enfants au Togo",
  signatory: "La trésorière",
};

const receipt: ReceiptData = {
  number: "2025-00003",
  year: 2025,
  amountCents: 40000,
  paymentCount: 16,
  methods: ["CARD", "SEPA_DEBIT"],
  donorName: "Claire Martin",
  donorAddress: "12 rue des Tilleuls\n69003 Lyon",
  issuedAt: new Date("2026-01-15T09:00:00Z"),
  ratePercent: 66,
};

describe("reçu fiscal", () => {
  it("écrit le montant en chiffres et en lettres, avec des espaces insécables", () => {
    const text = receiptText(receipt, association);
    expect(text.amount).toBe("400,00 €");
    expect(formatReceiptAmount(123456)).toBe("1 234,56 €");
    expect(text.amountInWords).toBe("Somme en toutes lettres : quatre cents euros");
  });

  it("reprend le donateur, le bénéficiaire et les modes de versement", () => {
    const text = receiptText(receipt, association);
    expect(text.number).toBe("Reçu n° 2025-00003");
    expect(text.donor).toEqual(["Claire Martin", "12 rue des Tilleuls", "69003 Lyon"]);
    expect(text.beneficiary).toEqual([
      "Association LRT",
      "4 rue de l'Exemple",
      "69001 Lyon",
      "Objet : Soutien à la scolarité d'enfants au Togo",
    ]);
    expect(text.details).toContain("Mode de versement : prélèvement, carte bancaire");
    expect(text.details[0]).toBe(
      "Versements reçus du 1er janvier au 31 décembre 2025 (reçu récapitulatif, 16 versements)",
    );
    expect(text.taxNote).toContain("66 % de leur montant");
    expect(text.signature).toEqual(["Le 15 janvier 2026", "La trésorière"]);
  });

  it("date le reçu à Paris, « 1er » le premier du mois", () => {
    expect(receiptDate(new Date("2026-01-31T23:30:00Z"))).toBe("1er février 2026");
  });

  it("produit un PDF d'une page, identique d'un téléchargement à l'autre", async () => {
    const first = await receiptPdf(receipt, association);
    const second = await receiptPdf(receipt, association);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    const pdf = await PDFDocument.load(first, { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Reçu fiscal 2025 n° 2025-00003");
    expect(pdf.getSubject()).toBe("Somme en toutes lettres : quatre cents euros");
    expect(pdf.getCreationDate()?.toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  it("remplace les lettres que la police standard ne sait pas écrire", async () => {
    const pdf = await receiptPdf(
      { ...receipt, donorName: "Łucja Nowak‐Ştefan", donorAddress: null },
      { ...association, address: "" },
    );
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
