import { describe, expect, it } from "vitest";
import {
  callCardLabel,
  callHour,
  callLongDay,
  callMoment,
  nextCallLines,
  slotDay,
  slotTimes,
} from "./call-labels";

const saturday = "2026-11-14T10:00:00Z";

describe("heures des appels", () => {
  it("écrit les créneaux comme P-Video", () => {
    expect(slotDay(saturday)).toBe("Sam. 14 nov.");
    expect(slotTimes(saturday)).toBe("11 h Paris · 10 h Lomé");
    expect(slotTimes("2026-11-21T09:00:00Z")).toBe("10 h Paris · 9 h Lomé");
    expect(slotTimes("2026-11-18T16:30:00Z")).toBe("17 h 30 Paris · 16 h 30 Lomé");
  });

  it("suit le changement d'heure de Paris, pas Lomé", () => {
    // Heure d'été : deux heures d'écart.
    expect(slotTimes("2026-06-20T10:00:00Z")).toBe("12 h Paris · 10 h Lomé");
  });

  it("donne le moment d'un appel, à Paris ou à Lomé", () => {
    expect(callMoment("2026-11-05T17:00:00Z")).toBe("jeudi 5 nov., 18 h");
    expect(callMoment("2026-11-05T17:00:00Z", "Africa/Lome")).toBe("jeudi 5 nov., 17 h");
    expect(callLongDay(saturday)).toBe("Samedi 14 novembre");
    expect(callHour(saturday, "Africa/Lome")).toBe("10 h");
  });
});

describe("cartes d'appel", () => {
  const slot = { id: "s", startsAt: saturday };

  it("nomme la demande et son issue", () => {
    expect(callCardLabel({ status: "REQUESTED", slot })).toBe(
      "Demande d'appel · samedi 14 nov., 11 h (Paris)",
    );
    expect(callCardLabel({ status: "CONFIRMED", slot })).toBe(
      "Appel confirmé · samedi 14 nov., 11 h (Paris)",
    );
    expect(callCardLabel({ status: "SLOTS_PROPOSED", slot: null })).toBe(
      "Autres créneaux proposés",
    );
    expect(callCardLabel({ status: "CANCELLED", slot })).toBe("Demande annulée");
  });

  it("reprend la carte « Prochain appel vidéo » de la maquette", () => {
    const base = { requestId: null, callId: "c", durationMinutes: 30, relaisName: "M. Koffi" };
    expect(nextCallLines({ ...base, state: "confirmed", startsAt: saturday })).toEqual({
      title: "Prochain appel vidéo",
      when: "Samedi 14 novembre · 11 h",
      detail: "Depuis la salle du relais, avec M. Koffi",
    });
    expect(nextCallLines({ ...base, state: "requested", startsAt: saturday }).detail).toBe(
      "En attente de la confirmation de M. Koffi",
    );
    expect(nextCallLines({ ...base, state: "proposed", startsAt: null }).when).toBeNull();
  });
});
