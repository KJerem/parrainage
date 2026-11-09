import type { ParrainCandidate, WaitingChild } from "@parrainage/contracts";
import { describe, expect, it } from "vitest";
import {
  activeSponsorshipsSub,
  candidateDetail,
  lastExchangeLabel,
  latePaymentsLabel,
  othersWaitingLabel,
  parrainStatusLabel,
  waitingChildLines,
  watchChip,
  watchTitle,
} from "./bureau-labels";

const now = "2026-10-31T10:00:00.000Z";
const daysAgo = (days: number) => new Date(Date.parse(now) - days * 86_400_000).toISOString();

describe("libellés du bureau", () => {
  it("écrit le dernier échange comme la maquette", () => {
    expect(lastExchangeLabel(daysAgo(1), now)).toBe("hier");
    expect(lastExchangeLabel(daysAgo(64), now)).toBe("64 j");
    expect(lastExchangeLabel(daysAgo(92), now)).toBe("3 mois");
    expect(lastExchangeLabel(daysAgo(0), now)).toBe("aujourd'hui");
    expect(lastExchangeLabel(null, now)).toBe("Aucun");
  });

  it("résume versements et réseau", () => {
    expect(latePaymentsLabel(0)).toBe("À jour");
    expect(latePaymentsLabel(2)).toBe("2 en retard");
    expect(activeSponsorshipsSub(2, 3)).toBe("dans 2 pays · 3 relais");
    expect(activeSponsorshipsSub(1, 1)).toBe("dans 1 pays · 1 relais");
  });

  it("présente les binômes à surveiller", () => {
    const relais = { id: "r", displayName: "M. Koffi", city: "Lomé" };
    const kofi = { id: "k", firstName: "Kofi", lastInitial: "A" };
    const alert = {
      kind: "sponsorship" as const,
      id: "s",
      child: kofi,
      parrainName: "Paul D.",
      relais,
      health: "TO_FOLLOW_UP" as const,
      days: 64,
    };
    expect(watchTitle(alert)).toBe("Kofi A. · Paul D.");
    expect(watchChip(alert)).toEqual({ label: "64 j sans nouvelle", variant: "danger" });
    expect(watchChip({ ...alert, health: "INACTIVE_PARRAIN" }).label).toBe("Parrain inactif");
    const waiting = {
      kind: "waiting" as const,
      id: "e",
      child: { id: "e", firstName: "Esther", lastInitial: "N" },
      relais,
    };
    expect(watchTitle(waiting)).toBe("Esther N. · en attente");
    expect(watchChip(waiting)).toEqual({ label: "À parrainer", variant: "info" });
  });

  it("décrit les parrains proposés", () => {
    const sophie: ParrainCandidate = {
      id: "p",
      displayName: "Sophie L.",
      city: "Nantes",
      gender: "F",
      wishes: "Souhaite une fille en primaire",
      filleuls: [],
    };
    expect(candidateDetail(sophie)).toBe("Nouvelle marraine · souhaite une fille en primaire");
    expect(candidateDetail({ ...sophie, gender: "M", wishes: null })).toBe("Nouveau parrain");
    expect(candidateDetail({ ...sophie, filleuls: ["Yao D."] })).toBe("Parraine déjà Yao D.");
    expect(candidateDetail({ ...sophie, filleuls: ["Yao D.", "Awa K."] })).toBe(
      "Parraine déjà Yao D. et Awa K.",
    );
    expect(candidateDetail({ ...sophie, filleuls: ["a", "b", "c"] })).toBe(
      "Parraine déjà 3 enfants",
    );
  });

  it("présente l'enfant en attente et les autres", () => {
    const esther: WaitingChild = {
      id: "e",
      firstName: "Esther",
      lastInitial: "N",
      gender: "F",
      age: 8,
      className: "CE1",
      schoolName: "EPP Bè",
      city: "Lomé",
      avatarTone: "info",
      photo: null,
      fileStatus: "SUBMITTED",
      addedBy: "M. Koffi",
    };
    expect(waitingChildLines(esther)).toEqual([
      "8 ans · CE1 · EPP Bè, Lomé",
      "Dossier complet · ajouté par M. Koffi",
    ]);
    expect(waitingChildLines({ ...esther, fileStatus: "VALIDATED", schoolName: null })[0]).toBe(
      "8 ans · CE1 · Lomé",
    );
    expect(othersWaitingLabel(2)).toBe("2 autres enfants attendent un parrain.");
    expect(othersWaitingLabel(1)).toBe("1 autre enfant attend un parrain.");
    expect(othersWaitingLabel(0)).toBe("Aucun autre enfant n'attend de parrain.");
  });

  it("accorde l'état des parrains", () => {
    expect(parrainStatusLabel("INVITED", "F").label).toBe("Invitée");
    expect(parrainStatusLabel("WITH_CHILD", "M").label).toBe("Parrain");
    expect(parrainStatusLabel("WAITING", "F").label).toBe("En attente d'un filleul");
  });
});
