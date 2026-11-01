import { z } from "zod";
import { toFieldErrors } from "./validation.js";

describe("toFieldErrors", () => {
  beforeAll(() => {
    z.config(z.locales.fr());
  });

  afterAll(() => {
    z.config(z.locales.en());
  });

  it("regroupe les erreurs zod par champ, en français", () => {
    const schema = z.object({ email: z.email(), address: z.object({ city: z.string().min(2) }) });
    const result = schema.safeParse({ email: "pas-une-adresse", address: { city: "" } });
    expect(result.success).toBe(false);
    const fieldErrors = toFieldErrors(result.error!.issues);
    expect(Object.keys(fieldErrors).sort()).toEqual(["address.city", "email"]);
    expect(fieldErrors.email![0]).toMatch(/invalide/i);
  });

  it("range les erreurs sans chemin sous « _ »", () => {
    const result = z.string().safeParse(42);
    expect(Object.keys(toFieldErrors(result.error!.issues))).toEqual(["_"]);
  });
});
