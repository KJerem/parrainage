// Données de démonstration (plan §10). Tout est fictif : noms, adresses, téléphones.
import type { AvatarTone, Role } from "@parrainage/contracts";
import { addDays, addMonths, birthDateForAge, day, schoolYearOf } from "./dates.js";
import { createRandom, type Random } from "./random.js";

export type Gender = "F" | "M";
export type SchoolLevel = "PRIMAIRE" | "COLLEGE" | "LYCEE";
export type FileStatus = "DRAFT" | "SUBMITTED" | "VALIDATED" | "ARCHIVED";

export interface SeedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface SeedParrain extends SeedUser {
  profile: {
    id: string;
    firstName: string;
    lastInitial: string;
    displayName: string;
    gender: Gender;
    city: string;
    country: string;
    timeZone: string;
    addressLine: string | null;
    postalCode: string | null;
    wishes: string | null;
    avatarTone: AvatarTone;
    debitDay: number;
    joinedAt: Date;
    lastActiveAt: Date;
  };
}

export interface SeedRelais extends SeedUser {
  relais: {
    id: string;
    displayName: string;
    city: string;
    district: string;
    lastActivityAt: Date;
  };
}

export interface SeedSchool {
  id: string;
  relaisId: string;
  shortName: string;
  fullName: string;
  city: string;
  level: SchoolLevel;
}

export interface SeedChild {
  id: string;
  relaisId: string;
  schoolId: string;
  firstName: string;
  lastInitial: string;
  gender: Gender;
  birthDate: Date;
  district: string;
  className: string;
  schoolYear: string;
  teacherName: string | null;
  avatarTone: AvatarTone;
  guardianName: string;
  guardianPhone: string;
  consentSponsorship: boolean;
  consentMedia: boolean;
  fileStatus: FileStatus;
  createdById: string;
  submittedAt: Date | null;
  validatedAt: Date | null;
}

export interface SeedSponsorship {
  id: string;
  childId: string;
  parrainId: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  monthlyAmountCents: number;
  startDate: Date;
}

export interface SeedData {
  bureau: SeedUser;
  parrains: SeedParrain[];
  relais: SeedRelais[];
  schools: SeedSchool[];
  children: SeedChild[];
  sponsorships: SeedSponsorship[];
}

/** Mensualité par défaut d'un binôme : 25 €. */
export const DEFAULT_MONTHLY_CENTS = 2500;

/** Numéro masqué : aucun vrai numéro dans le seed. */
const FICTITIOUS_PHONE = "+228 ·· ·· ·· ··";

const PRIMARY_CLASSES: Record<number, string> = {
  6: "CP1",
  7: "CP2",
  8: "CE1",
  9: "CE2",
  10: "CM1",
  11: "CM2",
};
const COLLEGE_CLASSES: Record<number, string> = { 12: "6e", 13: "5e", 14: "4e", 15: "3e" };

const CHILD_TONES: readonly AvatarTone[] = [
  "amber",
  "brand",
  "info",
  "amber-soft",
  "info-strong",
  "neutral",
];
const PARRAIN_TONES: readonly AvatarTone[] = ["info-strong", "brand", "info", "neutral", "amber"];
const INITIALS = "ABDEGKLMNOSTYZ";
const TEACHERS = ["M. Adjovi", "Mme Amegah", "M. Lawson", "Mme Kpodar", "M. Tchala", "Mme Gbeasor"];

const userId = (slug: string) => `seed-user-${slug}`;
const parrainId = (slug: string) => `seed-parrain-${slug}`;
const relaisId = (slug: string) => `seed-relais-${slug}`;
const schoolId = (slug: string) => `seed-school-${slug}`;
const childId = (slug: string) => `seed-child-${slug}`;

function guardianFor(random: Random, lastInitial: string): string {
  const relation = random.pick([
    ["Mme", "mère"],
    ["M.", "père"],
    ["Mme", "grand-mère"],
    ["M.", "oncle"],
    ["Mme", "tante"],
  ] as const);
  return `${relation[0]} ${lastInitial}. (${relation[1]})`;
}

export function buildSeedData(today: Date): SeedData {
  const random = createRandom(20261031);
  const schoolYear = schoolYearOf(today);
  const ago = (days: number) => addDays(today, -days);

  // ─── Bureau et relais ──────────────────────────────────────────────────────
  const bureau: SeedUser = {
    id: userId("bureau"),
    email: "bureau@exemple.fr",
    name: "Bureau · trésorerie",
    role: "bureau",
  };

  const relaisSpec = [
    {
      slug: "koffi",
      name: "M. Koffi",
      email: "koffi@relais.exemple.tg",
      city: "Lomé",
      district: "Bè",
      active: 0,
    },
    {
      slug: "diallo",
      name: "Mme Diallo",
      email: "diallo@relais.exemple.tg",
      city: "Kara",
      district: "Tomdè",
      active: 4,
    },
    {
      slug: "agbeko",
      name: "M. Agbeko",
      email: "agbeko@relais.exemple.tg",
      city: "Kpalimé",
      district: "Nyivémé",
      active: 9,
    },
  ];
  const relais: SeedRelais[] = relaisSpec.map((r) => ({
    id: userId(r.slug),
    email: r.email,
    name: r.name,
    role: "relais",
    relais: {
      id: relaisId(r.slug),
      displayName: r.name,
      city: r.city,
      district: r.district,
      lastActivityAt: ago(r.active),
    },
  }));

  const schools: SeedSchool[] = [
    {
      slug: "epp-be",
      relais: "koffi",
      shortName: "EPP Bè",
      fullName: "École primaire publique de Bè",
      city: "Lomé",
      level: "PRIMAIRE" as const,
    },
    {
      slug: "epp-akodessewa",
      relais: "koffi",
      shortName: "EPP Akodessewa",
      fullName: "École primaire publique d'Akodessewa",
      city: "Lomé",
      level: "PRIMAIRE" as const,
    },
    {
      slug: "ceg-be",
      relais: "koffi",
      shortName: "CEG Bè",
      fullName: "Collège d'enseignement général de Bè",
      city: "Lomé",
      level: "COLLEGE" as const,
    },
    {
      slug: "epp-tomde",
      relais: "diallo",
      shortName: "EPP Tomdè",
      fullName: "École primaire publique de Tomdè",
      city: "Kara",
      level: "PRIMAIRE" as const,
    },
    {
      slug: "epp-nyiveme",
      relais: "agbeko",
      shortName: "EPP Nyivémé",
      fullName: "École primaire publique de Nyivémé",
      city: "Kpalimé",
      level: "PRIMAIRE" as const,
    },
  ].map(({ slug, relais: owner, ...school }) => ({
    id: schoolId(slug),
    relaisId: relaisId(owner),
    ...school,
  }));

  // ─── Parrains ──────────────────────────────────────────────────────────────
  const parrains: SeedParrain[] = [];
  const addParrain = (
    slug: string,
    email: string,
    spec: {
      firstName: string;
      lastInitial: string;
      gender: Gender;
      city: string;
      country?: string;
      timeZone?: string;
      addressLine?: string;
      postalCode?: string;
      wishes?: string;
      avatarTone: AvatarTone;
      joinedAt: Date;
      lastActiveAt: Date;
    },
  ): SeedParrain => {
    const displayName = `${spec.firstName} ${spec.lastInitial}.`;
    const parrain: SeedParrain = {
      id: userId(slug),
      email,
      name: displayName,
      role: "parrain",
      profile: {
        id: parrainId(slug),
        firstName: spec.firstName,
        lastInitial: spec.lastInitial,
        displayName,
        gender: spec.gender,
        city: spec.city,
        country: spec.country ?? "France",
        timeZone: spec.timeZone ?? "Europe/Paris",
        addressLine: spec.addressLine ?? null,
        postalCode: spec.postalCode ?? null,
        wishes: spec.wishes ?? null,
        avatarTone: spec.avatarTone,
        debitDay: 5,
        joinedAt: spec.joinedAt,
        lastActiveAt: spec.lastActiveAt,
      },
    };
    parrains.push(parrain);
    return parrain;
  };

  const claire = addParrain("claire", "claire.m@exemple.fr", {
    firstName: "Claire",
    lastInitial: "M",
    gender: "F",
    city: "Lyon",
    addressLine: "12 rue des Tilleuls",
    postalCode: "69003",
    avatarTone: "info-strong",
    joinedAt: day("2023-02-20"),
    lastActiveAt: ago(1),
  });
  const paul = addParrain("paul", "paul.d@exemple.fr", {
    firstName: "Paul",
    lastInitial: "D",
    gender: "M",
    city: "Bordeaux",
    avatarTone: "neutral",
    joinedAt: day("2024-01-08"),
    lastActiveAt: ago(3),
  });
  const helene = addParrain("helene", "helene.r@exemple.fr", {
    firstName: "Hélène",
    lastInitial: "R",
    gender: "F",
    city: "Toulouse",
    avatarTone: "neutral",
    joinedAt: day("2024-09-15"),
    lastActiveAt: ago(2),
  });
  const marc = addParrain("marc", "marc.p@exemple.fr", {
    firstName: "Marc",
    lastInitial: "P",
    gender: "M",
    city: "Paris",
    avatarTone: "neutral",
    joinedAt: day("2023-10-20"),
    lastActiveAt: ago(5),
  });
  addParrain("sophie", "sophie.l@exemple.fr", {
    firstName: "Sophie",
    lastInitial: "L",
    gender: "F",
    city: "Nantes",
    wishes: "Souhaite parrainer une fille en primaire",
    avatarTone: "amber",
    joinedAt: ago(12),
    lastActiveAt: ago(2),
  });
  // Homonyme : marraine d'Ibrahim, inactive depuis 90 jours.
  const sophie2 = addParrain("sophie2", "sophie.l2@exemple.fr", {
    firstName: "Sophie",
    lastInitial: "L",
    gender: "F",
    city: "Lille",
    avatarTone: "neutral",
    joinedAt: day("2022-08-25"),
    lastActiveAt: ago(90),
  });

  const generatedParrains: readonly (readonly [string, Gender])[] = [
    ["Julie", "F"],
    ["Thomas", "M"],
    ["Camille", "F"],
    ["Nicolas", "M"],
    ["Isabelle", "F"],
    ["Pierre", "M"],
    ["Nathalie", "F"],
    ["Laurent", "M"],
    ["Céline", "F"],
    ["Julien", "M"],
    ["Anne", "F"],
    ["François", "M"],
    ["Élise", "F"],
    ["Olivier", "M"],
    ["Valérie", "F"],
    ["Antoine", "M"],
    ["Chloé", "F"],
    ["Vincent", "M"],
    ["Mathilde", "F"],
    ["Guillaume", "M"],
    ["Agathe", "F"],
    ["Benoît", "M"],
    ["Laure", "F"],
    ["Damien", "M"],
    ["Margaux", "F"],
  ];
  const parrainCities = [
    ["Lyon", "France", "Europe/Paris"],
    ["Paris", "France", "Europe/Paris"],
    ["Rennes", "France", "Europe/Paris"],
    ["Grenoble", "France", "Europe/Paris"],
    ["Strasbourg", "France", "Europe/Paris"],
    ["Montpellier", "France", "Europe/Paris"],
    ["Marseille", "France", "Europe/Paris"],
    ["Dijon", "France", "Europe/Paris"],
    ["Angers", "France", "Europe/Paris"],
    ["Tours", "France", "Europe/Paris"],
    ["Bruxelles", "Belgique", "Europe/Brussels"],
    ["Genève", "Suisse", "Europe/Zurich"],
  ] as const;
  const generated = generatedParrains.map(([firstName, gender], index) => {
    const [city, country, timeZone] = random.pick(parrainCities);
    return addParrain(`parrain${index + 1}`, `parrain${index + 1}@exemple.fr`, {
      firstName,
      lastInitial: random.pick([..."BCDFGHLMNPRST"]),
      gender,
      city,
      country,
      timeZone,
      avatarTone: random.pick(PARRAIN_TONES),
      joinedAt: ago(random.int(120, 1300)),
      lastActiveAt: ago(random.int(0, 40)),
    });
  });

  // ─── Enfants et binômes ────────────────────────────────────────────────────
  const children: SeedChild[] = [];
  const sponsorships: SeedSponsorship[] = [];
  const sponsor = (child: SeedChild, parrain: SeedParrain, startDate: Date) => {
    sponsorships.push({
      id: `seed-sponsorship-${child.id.replace("seed-child-", "")}-${parrain.profile.id.replace("seed-parrain-", "")}`,
      childId: child.id,
      parrainId: parrain.profile.id,
      status: "ACTIVE",
      monthlyAmountCents: DEFAULT_MONTHLY_CENTS,
      startDate,
    });
  };

  const addChild = (
    slug: string,
    owner: SeedRelais,
    school: SeedSchool,
    spec: {
      firstName: string;
      lastInitial: string;
      gender: Gender;
      birthDate: Date;
      className: string;
      district?: string;
      avatarTone: AvatarTone;
      guardianName?: string;
      consentMedia?: boolean;
      fileStatus?: FileStatus;
      /** Date de validation (ou de soumission pour un dossier SUBMITTED). */
      fileDate: Date;
    },
  ): SeedChild => {
    const fileStatus = spec.fileStatus ?? "VALIDATED";
    const child: SeedChild = {
      id: childId(slug),
      relaisId: owner.relais.id,
      schoolId: school.id,
      firstName: spec.firstName,
      lastInitial: spec.lastInitial,
      gender: spec.gender,
      birthDate: spec.birthDate,
      district: spec.district ?? owner.relais.district,
      className: spec.className,
      schoolYear,
      teacherName: random.pick(TEACHERS),
      avatarTone: spec.avatarTone,
      guardianName: spec.guardianName ?? guardianFor(random, spec.lastInitial),
      guardianPhone: FICTITIOUS_PHONE,
      consentSponsorship: true,
      consentMedia: spec.consentMedia ?? true,
      fileStatus,
      createdById: owner.id,
      submittedAt: fileStatus === "VALIDATED" ? addDays(spec.fileDate, -7) : spec.fileDate,
      validatedAt: fileStatus === "VALIDATED" ? spec.fileDate : null,
    };
    children.push(child);
    return child;
  };

  const [koffi, diallo, agbeko] = relais as [SeedRelais, SeedRelais, SeedRelais];
  const [eppBe, eppAkodessewa, cegBe, eppTomde, eppNyiveme] = schools as [
    SeedSchool,
    SeedSchool,
    SeedSchool,
    SeedSchool,
    SeedSchool,
  ];

  const aicha = addChild("aicha", koffi, eppBe, {
    firstName: "Aïcha",
    lastInitial: "S",
    gender: "F",
    birthDate: birthDateForAge(today, 12, 140),
    className: "CM2",
    avatarTone: "amber",
    guardianName: "Mme S. (mère)",
    fileDate: day("2023-02-10"),
  });
  const kofi = addChild("kofi", koffi, eppBe, {
    firstName: "Kofi",
    lastInitial: "A",
    gender: "M",
    birthDate: birthDateForAge(today, 10, 75),
    className: "CE2",
    avatarTone: "brand",
    guardianName: "M. A. (père)",
    fileDate: day("2023-12-20"),
  });
  addChild("esther", koffi, eppBe, {
    firstName: "Esther",
    lastInitial: "N",
    gender: "F",
    birthDate: day("2018-03-12"),
    className: "CE1",
    avatarTone: "info",
    guardianName: "Mme N. (mère)",
    consentMedia: false,
    fileStatus: "SUBMITTED",
    fileDate: ago(3),
  });
  const yao = addChild("yao", koffi, cegBe, {
    firstName: "Yao",
    lastInitial: "D",
    gender: "M",
    birthDate: birthDateForAge(today, 14, 200),
    className: "5e",
    avatarTone: "info",
    guardianName: "Mme D. (tante)",
    fileDate: day("2023-10-10"),
  });
  const mariam = addChild("mariam", koffi, eppAkodessewa, {
    firstName: "Mariam",
    lastInitial: "T",
    gender: "F",
    birthDate: birthDateForAge(today, 11, 30),
    className: "CM1",
    district: "Akodessewa",
    avatarTone: "amber-soft",
    guardianName: "M. T. (père)",
    fileDate: day("2024-09-20"),
  });
  const ibrahim = addChild("ibrahim", diallo, eppTomde, {
    firstName: "Ibrahim",
    lastInitial: "K",
    gender: "M",
    birthDate: birthDateForAge(today, 9, 110),
    className: "CE2",
    avatarTone: "brand",
    fileDate: day("2022-08-20"),
  });

  sponsor(aicha, claire, day("2023-03-01"));
  sponsor(kofi, claire, day("2025-09-01"));
  sponsor(kofi, paul, day("2024-01-15"));
  sponsor(mariam, helene, day("2024-10-01"));
  sponsor(yao, marc, day("2023-11-01"));
  sponsor(ibrahim, sophie2, day("2022-09-01"));

  // Enfants générés : 13 à Lomé (18 au total), 10 à Kara (11), 9 à Kpalimé.
  const generatedChildren: { owner: SeedRelais; names: readonly (readonly [string, Gender])[] }[] =
    [
      {
        owner: koffi,
        names: [
          ["Afi", "F"],
          ["Komla", "M"],
          ["Ama", "F"],
          ["Kossi", "M"],
          ["Akossiwa", "F"],
          ["Edem", "M"],
          ["Sena", "F"],
          ["Yawa", "F"],
          ["Kodjo", "M"],
          ["Abla", "F"],
          ["Mawuli", "M"],
          ["Dzifa", "F"],
          ["Elom", "M"],
        ],
      },
      {
        owner: diallo,
        names: [
          ["Fatima", "F"],
          ["Moussa", "M"],
          ["Awa", "F"],
          ["Issa", "M"],
          ["Essowè", "F"],
          ["Pidassa", "M"],
          ["Aminata", "F"],
          ["Abdou", "M"],
          ["Kanda", "M"],
          ["Mariama", "F"],
        ],
      },
      {
        owner: agbeko,
        names: [
          ["Kafui", "F"],
          ["Delali", "M"],
          ["Senam", "F"],
          ["Yayra", "F"],
          ["Elikem", "M"],
          ["Dela", "M"],
          ["Akpene", "F"],
          ["Kokou", "M"],
          ["Enyonam", "F"],
        ],
      },
    ];
  const schoolsOf = (owner: SeedRelais) => schools.filter((s) => s.relaisId === owner.relais.id);

  let sponsoredCount = 0;
  const parrainLoad = new Map<string, number>();
  for (const { owner, names } of generatedChildren) {
    names.forEach(([firstName, gender], index) => {
      const school = random.pick(schoolsOf(owner));
      const age = school.level === "COLLEGE" ? random.int(12, 15) : random.int(6, 11);
      const className = (school.level === "COLLEGE" ? COLLEGE_CLASSES : PRIMARY_CLASSES)[age]!;
      // Le dernier enfant de Kara et de Kpalimé attend un parrain (avec Esther : 3 au total).
      const waiting = owner !== koffi && index === names.length - 1;
      const parrain = waiting ? undefined : generated[sponsoredCount % generated.length]!;
      const rank = parrain ? (parrainLoad.get(parrain.id) ?? 0) : 0;
      const startDate = parrain
        ? minDate(firstOfNextMonth(addMonths(parrain.profile.joinedAt, rank * 2)), ago(10))
        : ago(random.int(20, 60));
      const child = addChild(
        `${owner.relais.id.replace("seed-relais-", "")}-${index + 1}`,
        owner,
        school,
        {
          firstName,
          lastInitial: random.pick([...INITIALS]),
          gender,
          birthDate: birthDateForAge(today, age, random.int(0, 300)),
          className,
          district: school.shortName === "EPP Akodessewa" ? "Akodessewa" : undefined,
          avatarTone: random.pick(CHILD_TONES),
          consentMedia: random.next() > 0.15,
          fileDate: parrain ? addDays(startDate, -14) : startDate,
        },
      );
      if (parrain) {
        sponsor(child, parrain, startDate);
        parrainLoad.set(parrain.id, rank + 1);
        sponsoredCount += 1;
      }
    });
  }

  return { bureau, parrains, relais, schools, children, sponsorships };
}

function firstOfNextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}
