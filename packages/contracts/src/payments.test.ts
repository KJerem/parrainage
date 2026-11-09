import { describe, expect, it } from "vitest";
import {
  createDonationSchema,
  donationLabel,
  parrainPaymentsQuerySchema,
  receiptPath,
  updateMonthlyAmountSchema,
  updatePaymentMethodSchema,
} from "./payments.js";

describe("versements", () => {
  it("accepte une mensualité en euros entiers, de 10 à 500 €", () => {
    expect(updateMonthlyAmountSchema.safeParse({ childId: "c", amountCents: 3000 }).success).toBe(
      true,
    );
    const tooLow = updateMonthlyAmountSchema.safeParse({ childId: "c", amountCents: 500 });
    expect(tooLow.error?.issues[0]?.message).toBe("La mensualité va de 10 € à 500 €");
    expect(updateMonthlyAmountSchema.safeParse({ childId: "c", amountCents: 60000 }).success).toBe(
      false,
    );
    const cents = updateMonthlyAmountSchema.safeParse({ childId: "c", amountCents: 3050 });
    expect(cents.error?.issues[0]?.message).toBe("Indiquez un montant en euros, sans centimes");
  });

  it("accepte un don de 5 à 1 000 €, avec un mot court et une clé d'idempotence", () => {
    const donation = { childId: "c", amountCents: 4000, idempotencyKey: "don-12345678" };
    expect(createDonationSchema.parse(donation).note).toBe("");
    expect(createDonationSchema.safeParse({ ...donation, amountCents: 400 }).success).toBe(false);
    expect(createDonationSchema.safeParse({ ...donation, note: "x".repeat(41) }).success).toBe(
      false,
    );
    expect(createDonationSchema.safeParse({ ...donation, idempotencyKey: "court" }).success).toBe(
      false,
    );
  });

  it("propose le prélèvement ou la carte, un jour de 1 à 28", () => {
    expect(updatePaymentMethodSchema.safeParse({ method: "CARD", debitDay: 28 }).success).toBe(
      true,
    );
    expect(updatePaymentMethodSchema.safeParse({ method: "CHEQUE", debitDay: 5 }).success).toBe(
      false,
    );
    expect(
      updatePaymentMethodSchema.safeParse({ method: "SEPA_DEBIT", debitDay: 31 }).success,
    ).toBe(false);
  });

  it("lit l'année affichée dans l'adresse", () => {
    expect(parrainPaymentsQuerySchema.parse({ annee: "2025" }).annee).toBe(2025);
    expect(parrainPaymentsQuerySchema.parse({}).annee).toBeUndefined();
    expect(parrainPaymentsQuerySchema.safeParse({ annee: "deux-mille" }).success).toBe(false);
  });

  it("nomme les dons ponctuels et le chemin des reçus", () => {
    expect(donationLabel(" rentrée ")).toBe("Don ponctuel · rentrée");
    expect(donationLabel("")).toBe("Don ponctuel");
    expect(receiptPath(2025)).toBe("/api/parrain/receipts/2025");
  });
});
