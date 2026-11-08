import { describe, expect, it } from "vitest";
import {
  callIcsPath,
  callWindow,
  createCallRequestSchema,
  createCallSlotsSchema,
  proposeCallSlotsSchema,
} from "./calls.js";

describe("appels vidéo", () => {
  it("ouvre la salle avant l'appel et la ferme 15 minutes après la fin prévue", () => {
    const { opensAt, closesAt } = callWindow(new Date("2026-11-05T17:00:00Z"), 30, 10);
    expect(opensAt.toISOString()).toBe("2026-11-05T16:50:00.000Z");
    expect(closesAt.toISOString()).toBe("2026-11-05T17:45:00.000Z");
  });

  it("n'accepte que des appels de 15 ou 30 minutes, avec un mot court", () => {
    const request = { childId: "c", slotId: "s" };
    expect(createCallRequestSchema.parse({ ...request, durationMinutes: 15 }).note).toBe("");
    expect(createCallRequestSchema.safeParse({ ...request, durationMinutes: 45 }).success).toBe(
      false,
    );
    expect(
      createCallRequestSchema.safeParse({ ...request, durationMinutes: 30, note: "x".repeat(501) })
        .success,
    ).toBe(false);
  });

  it("propose 3 créneaux au plus, sans doublon", () => {
    expect(proposeCallSlotsSchema.safeParse({ slotIds: ["a", "b", "c"] }).success).toBe(true);
    expect(proposeCallSlotsSchema.safeParse({ slotIds: ["a", "b", "c", "d"] }).success).toBe(false);
    expect(proposeCallSlotsSchema.safeParse({ slotIds: ["a", "a"] }).success).toBe(false);
    expect(proposeCallSlotsSchema.safeParse({ slotIds: [] }).success).toBe(false);
  });

  it("publie des créneaux datés, sans doublon", () => {
    expect(createCallSlotsSchema.safeParse({ startsAt: ["2026-11-14T10:00:00Z"] }).success).toBe(
      true,
    );
    expect(
      createCallSlotsSchema.safeParse({
        startsAt: ["2026-11-14T10:00:00Z", "2026-11-14T10:00:00Z"],
      }).success,
    ).toBe(false);
    expect(createCallSlotsSchema.safeParse({ startsAt: ["samedi"] }).success).toBe(false);
  });

  it("donne le chemin du fichier agenda", () => {
    expect(callIcsPath("a b")).toBe("/api/calls/a%20b/ics");
  });
});
