import { describe, expect, it } from "vitest";
import {
  childDay,
  codeProgressLabel,
  lockedMessage,
  messageStatusLine,
  sentSentence,
  sentSteps,
  wrongCodeMessage,
} from "./eleve-labels";

const now = "2026-10-31T10:00:00Z";
const claire = { kind: "sponsor", name: "Claire" } as const;
const association = { kind: "association", name: "L'association" } as const;
const message = { createdAt: "2026-10-30T09:00:00Z", readAt: null };

describe("childDay", () => {
  it("écrit la date en minuscules, comme la maquette", () => {
    expect(childDay("2026-10-31T08:00:00Z", now)).toBe("aujourd'hui");
    expect(childDay("2026-10-30T08:00:00Z", now)).toBe("hier");
    expect(childDay("2026-10-14T08:00:00Z", now)).toBe("14 octobre");
  });

  it("suit l'heure de Lomé", () => {
    expect(childDay("2026-10-30T23:30:00Z", "2026-10-31T00:30:00Z")).toBe("hier");
  });
});

describe("messageStatusLine", () => {
  const line = (
    status: "relecture" | "garde" | "recu" | "lu" | null,
    dates: { deliveredAt?: string; readAt?: string } = {},
  ) =>
    messageStatusLine(
      { ...message, status, deliveredAt: dates.deliveredAt ?? null, readAt: dates.readAt ?? null },
      claire,
      "M. Koffi",
      now,
    );

  it("dit où en est le message, comme la maquette", () => {
    expect(line("relecture")).toBe("L'association le lit");
    expect(line("recu", { deliveredAt: "2026-10-30T12:00:00Z" })).toBe("Reçu par Claire · hier");
    expect(line("lu", { readAt: "2026-10-31T08:00:00Z" })).toBe("Lu par Claire · aujourd'hui");
  });

  it("renvoie au relais pour un message gardé, sans donner le motif", () => {
    expect(line("garde")).toBe("L'association l'a gardé. Parles-en à M. Koffi.");
  });

  it("ne dit rien des messages reçus", () => {
    expect(line(null)).toBeNull();
  });

  it("s'adapte à l'association", () => {
    const status = (value: "recu" | "lu") =>
      messageStatusLine(
        { ...message, status: value, deliveredAt: null },
        association,
        "M. Koffi",
        now,
      );
    expect(status("recu")).toBe("Lu par l'association");
    expect(status("lu")).toBe("Lu par l'association");
  });
});

describe("écran « Bravo »", () => {
  const sponsor = { recipient: "sponsor", recipientName: "Claire" } as const;

  it("reprend la phrase de la maquette pour un bulletin", () => {
    expect(sentSentence({ ...sponsor, content: "bulletin" })).toBe(
      "Ton bulletin part chez Claire. L'association le regarde d'abord, puis Claire le reçoit.",
    );
  });

  it("accorde selon ce qui est envoyé", () => {
    expect(sentSentence({ ...sponsor, content: "photo" })).toBe(
      "Ta photo part chez Claire. L'association la regarde d'abord, puis Claire la reçoit.",
    );
    expect(sentSentence({ ...sponsor, content: "video" })).toContain("Ta vidéo part");
    expect(sentSentence({ ...sponsor, content: "message" })).toBe(
      "Ton message part chez Claire. L'association le lit d'abord, puis Claire le reçoit.",
    );
  });

  it("parle de l'association quand c'est elle qui reçoit", () => {
    expect(
      sentSentence({
        recipient: "association",
        recipientName: "l'association",
        content: "message",
      }),
    ).toBe("Ton message part à l'association. Elle le lit très vite.");
  });

  it("montre trois étapes à trois tons", () => {
    const steps = (status: "relecture" | "garde" | "recu" | "lu") =>
      sentSteps({ ...sponsor, status }).map((step) => step.state);
    expect(steps("relecture")).toEqual(["done", "current", "todo"]);
    expect(steps("garde")).toEqual(["done", "current", "todo"]);
    expect(steps("recu")).toEqual(["done", "done", "done"]);
    expect(steps("lu")).toEqual(["done", "done", "done"]);
    expect(sentSteps({ ...sponsor, status: "recu" }).at(-1)?.label).toBe("Reçu par Claire");
  });

  it("n'a que deux étapes vers l'association", () => {
    expect(
      sentSteps({
        recipient: "association",
        recipientName: "l'association",
        status: "relecture",
      }).map((step) => step.label),
    ).toEqual(["Envoyé", "Lu par l'association"]);
  });
});

describe("connexion", () => {
  it("accorde les essais restants", () => {
    expect(wrongCodeMessage(2)).toBe("Ce ne sont pas les bonnes images. Il te reste 2 essais.");
    expect(wrongCodeMessage(1)).toBe("Ce ne sont pas les bonnes images. Il te reste 1 essai.");
  });

  it("renvoie vers le relais quand les images sont bloquées", () => {
    expect(lockedMessage("M. Koffi")).toBe(
      "Tes images sont bloquées. Demande à M. Koffi de les débloquer.",
    );
  });

  it("annonce les cases remplies", () => {
    expect(codeProgressLabel(0, 3)).toBe("0 image touchée sur 3");
    expect(codeProgressLabel(2, 3)).toBe("2 images touchées sur 3");
  });
});
