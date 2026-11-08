import { isPastCall, splitCalls, toVideoCall, type VideoCallRow } from "./calls-common.js";

const row = (
  id: string,
  startsAt: string,
  overrides: Partial<VideoCallRow> = {},
): VideoCallRow => ({
  id,
  startsAt: new Date(startsAt),
  durationMinutes: 30,
  status: "SCHEDULED",
  joinedRelaisAt: null,
  endedAt: null,
  relais: { displayName: "M. Koffi" },
  sponsorship: {
    childId: "c",
    parrainId: "p",
    child: { firstName: "Kofi" },
    parrain: { displayName: "Claire M." },
  },
  ...overrides,
});

const now = new Date("2026-10-31T10:00:00Z");

describe("appels", () => {
  it("calcule la fenêtre d'accès et la durée réelle", () => {
    const call = toVideoCall(
      row("a", "2026-06-20T10:00:00Z", {
        status: "ENDED",
        joinedRelaisAt: new Date("2026-06-20T10:00:00Z"),
        endedAt: new Date("2026-06-20T10:22:00Z"),
      }),
      10,
    );
    expect(call).toMatchObject({
      joinOpensAt: "2026-06-20T09:50:00.000Z",
      joinClosesAt: "2026-06-20T10:45:00.000Z",
      minutes: 22,
      childFirstName: "Kofi",
      parrainName: "Claire M.",
    });
    expect(toVideoCall(row("b", "2026-11-05T17:00:00Z"), 10).minutes).toBeNull();
  });

  it("tient un appel pour passé une fois sa salle fermée", () => {
    expect(isPastCall(row("a", "2026-10-31T09:20:00Z"), now)).toBe(false);
    expect(isPastCall(row("a", "2026-10-31T09:15:00Z"), now)).toBe(true);
    expect(isPastCall(row("a", "2026-11-05T17:00:00Z", { status: "ENDED" }), now)).toBe(true);
  });

  it("range les appels à venir du plus proche, les passés du plus récent, sans les annulés", () => {
    const { upcoming, past } = splitCalls(
      [
        row("loin", "2026-11-14T10:00:00Z"),
        row("proche", "2026-11-05T17:00:00Z"),
        row("juin", "2026-06-20T10:00:00Z", { status: "ENDED" }),
        row("mai", "2026-05-03T10:00:00Z", { status: "ENDED" }),
        row("annule", "2026-11-06T10:00:00Z", { status: "CANCELLED" }),
      ],
      now,
      10,
    );
    expect(upcoming.map((call) => call.id)).toEqual(["proche", "loin"]);
    expect(past.map((call) => call.id)).toEqual(["juin", "mai"]);
  });
});
