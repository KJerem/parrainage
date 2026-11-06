import type { Counterpart, MessagePreview } from "@parrainage/contracts";
import { describe, expect, it } from "vitest";
import {
  alertHint,
  alertList,
  insertIdea,
  listName,
  previewText,
  recipientName,
  safetyNote,
  statusLabel,
  threadSubtitle,
} from "./messaging-labels";

const person = (kind: Counterpart["kind"], name: string, shortName = name): Counterpart => ({
  kind,
  id: kind === "bureau" ? null : `id-${kind}`,
  name,
  shortName,
  initials: "XX",
  avatarTone: "neutral",
  subtitle: null,
});

const aicha = {
  ...person("child", "Aïcha S.", "Aïcha"),
  subtitle: "Écrit depuis l'école, avec son relais M. Koffi",
};
const koffi = { ...person("relais", "M. Koffi"), subtitle: "Relais à Lomé" };
const claire = { ...person("parrain", "Claire M."), subtitle: "Marraine d'Aïcha et Kofi" };
const bureau = person("bureau", "Bureau de l'association");

const preview = (patch: Partial<MessagePreview>): MessagePreview => ({
  body: "Bonjour",
  mine: false,
  kind: "TEXT",
  attachmentCount: 0,
  createdAt: "2026-10-30T15:00:00.000Z",
  status: null,
  ...patch,
});

describe("noms de la messagerie", () => {
  it("nomme les conversations comme P-Messages et RW-Messages", () => {
    expect(listName(aicha)).toBe("Aïcha");
    expect(listName(koffi)).toBe("M. Koffi · relais");
    expect(listName(claire)).toBe("Claire M.");
    expect(listName(bureau)).toBe("Bureau de l'association");
  });

  it("nomme le destinataire dans une phrase", () => {
    expect(recipientName(aicha)).toBe("Aïcha");
    expect(recipientName(claire)).toBe("Claire");
    expect(recipientName(koffi)).toBe("M. Koffi");
    expect(recipientName(bureau)).toBe("l'association");
  });

  it("préfère l'objet de l'échange au sous-titre de la personne", () => {
    expect(threadSubtitle({ subject: null, counterpart: aicha })).toBe(aicha.subtitle);
    expect(
      threadSubtitle({ subject: "Demande d'appel vidéo avec Aïcha S.", counterpart: claire }),
    ).toBe("Demande d'appel vidéo avec Aïcha S.");
    expect(threadSubtitle({ subject: null, counterpart: bureau })).toBeNull();
  });
});

describe("previewText", () => {
  it("reprend le dernier message, préfixé pour le sien", () => {
    expect(previewText(preview({ body: "Merci pour le ballon !" }))).toBe("Merci pour le ballon !");
    expect(previewText(preview({ body: "Créneau proposé", mine: true }))).toBe(
      "Vous : Créneau proposé",
    );
  });

  it("décrit un message sans texte ou pas encore visible", () => {
    expect(previewText(preview({ body: "", attachmentCount: 1, mine: true }))).toBe(
      "Vous : Pièce jointe",
    );
    expect(previewText(preview({ body: "", attachmentCount: 3 }))).toBe("3 pièces jointes");
    expect(previewText(preview({ body: null }))).toBe("Message en relecture par l'association");
    expect(previewText(null)).toBe("Aucun message pour l'instant");
  });
});

describe("suivi et avertissements", () => {
  it("affiche le suivi d'un message envoyé", () => {
    expect(statusLabel("en_relecture", "Aïcha")).toBe("En relecture");
    expect(statusLabel("remis", "Aïcha")).toBe("Remis à Aïcha");
    expect(statusLabel("lu", "M. Koffi")).toBe("Lu par M. Koffi");
    expect(statusLabel("retenu", "Aïcha")).toBe("Retenu par l'association");
  });

  it("liste les coordonnées détectées en minuscules", () => {
    expect(alertList(["PHONE"])).toBe("numéro de téléphone");
    expect(alertList(["PHONE", "EMAIL", "SOCIAL"])).toBe(
      "numéro de téléphone, adresse e-mail et réseau social ou pseudo",
    );
    expect(alertHint(["PHONE"], "Aïcha")).toContain("avant de le remettre à Aïcha");
  });

  it("rappelle la règle de sécurité de la maquette", () => {
    expect(safetyNote("Aïcha")).toBe(
      "Les messages sont relus par l'association avant d'être remis à Aïcha. Pour sa sécurité, n'échangez ni adresse, ni téléphone, ni réseau social.",
    );
  });

  it("ajoute une idée au brouillon", () => {
    expect(insertIdea("", "Quelle est ta matière préférée ?")).toBe(
      "Quelle est ta matière préférée ?",
    );
    expect(insertIdea("Bonjour Aïcha !  \n", "Que fais-tu après l'école ?")).toBe(
      "Bonjour Aïcha ! Que fais-tu après l'école ?",
    );
  });
});
