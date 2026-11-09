import {
  firstDayOfNextMonth,
  initialOf,
  latest,
  parrainStatus,
  sponsorshipHealth,
} from "./health.js";

const at = new Date("2026-10-31T10:00:00Z");
const daysAgo = (days: number) => new Date(at.getTime() - days * 86_400_000);
const active = { lastActiveAt: daysAgo(1), joinedAt: daysAgo(400), latePayments: 0 };

describe("santé d'un binôme", () => {
  it("actif tant qu'une nouvelle ou un échange date de moins de 60 jours", () => {
    expect(
      sponsorshipHealth({
        at,
        parrain: active,
        startDate: daysAgo(900),
        lastExchangeAt: daysAgo(6),
      }),
    ).toEqual({ health: "ACTIVE", days: 6 });
  });

  it("à relancer à 60 jours sans nouvelle ni échange", () => {
    expect(
      sponsorshipHealth({
        at,
        parrain: active,
        startDate: daysAgo(900),
        lastExchangeAt: daysAgo(64),
      }),
    ).toEqual({ health: "TO_FOLLOW_UP", days: 64 });
    expect(
      sponsorshipHealth({ at, parrain: active, startDate: daysAgo(59), lastExchangeAt: null })
        .health,
    ).toBe("ACTIVE");
  });

  it("parrain inactif d'abord : 60 jours sans connexion ou 2 versements en retard", () => {
    const base = { at, startDate: daysAgo(900), lastExchangeAt: daysAgo(90) };
    expect(
      sponsorshipHealth({ ...base, parrain: { ...active, lastActiveAt: daysAgo(90) } }),
    ).toEqual({ health: "INACTIVE_PARRAIN", days: 90 });
    expect(sponsorshipHealth({ ...base, parrain: { ...active, latePayments: 2 } }).health).toBe(
      "INACTIVE_PARRAIN",
    );
    expect(sponsorshipHealth({ ...base, parrain: { ...active, latePayments: 1 } }).health).toBe(
      "TO_FOLLOW_UP",
    );
  });

  it("un binôme qui commence demain est actif", () => {
    expect(
      sponsorshipHealth({
        at,
        parrain: active,
        startDate: new Date("2026-11-01"),
        lastExchangeAt: null,
      }),
    ).toEqual({ health: "ACTIVE", days: 0 });
  });
});

describe("état d'un parrain", () => {
  it("invité, inactif, en attente ou parrain", () => {
    expect(parrainStatus({ ...active, lastActiveAt: null, activeSponsorships: 0 }, at)).toBe(
      "INVITED",
    );
    expect(parrainStatus({ ...active, latePayments: 2, activeSponsorships: 1 }, at)).toBe(
      "INACTIVE",
    );
    expect(parrainStatus({ ...active, activeSponsorships: 0 }, at)).toBe("WAITING");
    expect(parrainStatus({ ...active, activeSponsorships: 2 }, at)).toBe("WITH_CHILD");
  });
});

describe("outils", () => {
  it("prend le plus récent des instants connus", () => {
    expect(latest(null, daysAgo(3), undefined, daysAgo(1))).toEqual(daysAgo(1));
    expect(latest(null, undefined)).toBeNull();
  });

  it("propose le premier jour du mois suivant", () => {
    expect(firstDayOfNextMonth(at)).toBe("2026-11-01");
    expect(firstDayOfNextMonth(new Date("2026-12-15T10:00:00Z"))).toBe("2027-01-01");
  });

  it("tire l'initiale du nom, sans accent", () => {
    expect(initialOf(" élise")).toBe("E");
    expect(initialOf("Martin")).toBe("M");
  });
});
