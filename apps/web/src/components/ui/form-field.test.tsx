import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Checkbox, FormField, Input, RadioCard, Select, Textarea } from "./form-field";

afterEach(cleanup);

describe("FormField", () => {
  it("associe le libellé au champ", () => {
    render(
      <FormField label="Adresse e-mail">
        <Input type="email" />
      </FormField>,
    );
    const input = screen.getByLabelText("Adresse e-mail");
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });

  it("relie l'erreur au champ avec aria-invalid et aria-describedby", () => {
    render(
      <FormField label="Mot de passe" id="mdp" error="Mot de passe incorrect.">
        <Input type="password" />
      </FormField>,
    );
    const input = screen.getByLabelText("Mot de passe");
    expect(input.id).toBe("mdp");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const error = screen.getByText("Mot de passe incorrect.");
    expect(error.id).toBe("mdp-erreur");
    expect(input.getAttribute("aria-describedby")).toBe("mdp-erreur");
    expect(error.className).toContain("text-danger-600");
    expect(input.className).toContain("aria-invalid:border-danger-600");
  });

  it("cumule aide, erreur et description propre au champ", () => {
    render(
      <FormField
        label="Message aux parrains"
        hint="Astuce : vous pouvez dicter le texte avec le micro de votre téléphone."
        error="Le message est vide."
      >
        <Textarea aria-describedby="compteur" />
      </FormField>,
    );
    const textarea = screen.getByLabelText("Message aux parrains");
    const ids = textarea.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(ids[0]).toBe("compteur");
    expect(ids).toHaveLength(3);
    const hint = screen.getByText(/Astuce/);
    const error = screen.getByText("Le message est vide.");
    expect(ids).toContain(hint.id);
    expect(ids).toContain(error.id);
  });

  it("accepte une fonction pour placer le champ", () => {
    render(
      <FormField label="Durée" error="Choisissez une durée." required>
        {(field) => (
          <Select {...field}>
            <option>15 minutes</option>
          </Select>
        )}
      </FormField>,
    );
    const select = screen.getByLabelText("Durée") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.required).toBe(true);
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(select.getAttribute("aria-describedby")).toBe(
      screen.getByText("Choisissez une durée.").id,
    );
  });

  it("masque visuellement le libellé sans le retirer", () => {
    render(
      <FormField label="Rechercher" hideLabel>
        <Input type="search" placeholder="Rechercher une conversation" />
      </FormField>,
    );
    expect(screen.getByText("Rechercher").className).toContain("sr-only");
    expect(screen.getByRole("searchbox", { name: "Rechercher" })).toBeTruthy();
  });

  it("applique la variante enfant", () => {
    render(
      <FormField label="Écris ton message" size="kid">
        <Textarea size="kid" />
      </FormField>,
    );
    expect(screen.getByText("Écris ton message").className).toContain("text-18");
    const textarea = screen.getByLabelText("Écris ton message");
    expect(textarea.className).toContain("border-2");
    expect(textarea.className).toContain("rounded-14");
  });
});

describe("Checkbox et RadioCard", () => {
  it("rend une case à cocher libellée", () => {
    render(<Checkbox label="Le bureau de l'association" defaultChecked />);
    const checkbox = screen.getByRole("checkbox", { name: "Le bureau de l'association" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(checkbox.className).toContain("accent-brand-700");
  });

  it("rend une carte radio cliquable", () => {
    render(
      <RadioCard name="parrain" value="sophie" defaultChecked>
        <span>Sophie L.</span>
      </RadioCard>,
    );
    const radio = screen.getByRole("radio", { name: "Sophie L." });
    expect((radio as HTMLInputElement).checked).toBe(true);
    expect(radio.closest("label")?.className).toContain("has-checked:bg-brand-100");
  });
});
