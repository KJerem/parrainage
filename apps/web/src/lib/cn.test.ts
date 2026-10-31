import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("garde ensemble une taille et une couleur de texte", () => {
    expect(cn("text-15", "text-ink")).toBe("text-15 text-ink");
  });

  it("ne garde que la dernière taille de texte", () => {
    expect(cn("text-14", "text-16")).toBe("text-16");
  });

  it("ne garde que la dernière couleur de fond", () => {
    expect(cn("bg-white", "bg-brand-700")).toBe("bg-brand-700");
  });

  it("ne garde que le dernier rayon", () => {
    expect(cn("rounded-10", "rounded-16")).toBe("rounded-16");
  });

  it("ignore les valeurs fausses", () => {
    expect(cn("p-4", false, undefined, "font-bold")).toBe("p-4 font-bold");
  });
});
