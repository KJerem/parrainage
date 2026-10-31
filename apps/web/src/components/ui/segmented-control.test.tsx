import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./segmented-control";

afterEach(cleanup);

const durations = [
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 h" },
];

function radio(name: string) {
  return screen.getByRole("radio", { name });
}

describe("SegmentedControl", () => {
  it("expose un groupe radio avec un seul arrêt de tabulation", () => {
    render(<SegmentedControl aria-label="Durée" options={durations} defaultValue="45" />);
    expect(screen.getByRole("radiogroup", { name: "Durée" })).toBeTruthy();
    expect(radio("45 min").getAttribute("aria-checked")).toBe("true");
    expect(radio("30 min").getAttribute("aria-checked")).toBe("false");
    expect(radio("45 min").tabIndex).toBe(0);
    expect(radio("30 min").tabIndex).toBe(-1);
    expect(radio("1 h").tabIndex).toBe(-1);
    expect(radio("45 min").className).toContain("bg-brand-700");
  });

  it("déplace la sélection et le focus avec les flèches", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Durée"
        options={durations}
        defaultValue="30"
        onValueChange={onValueChange}
      />,
    );

    await user.tab();
    expect(document.activeElement).toBe(radio("30 min"));

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(radio("45 min"));
    expect(radio("45 min").getAttribute("aria-checked")).toBe("true");
    expect(radio("30 min").getAttribute("aria-checked")).toBe("false");
    expect(radio("45 min").tabIndex).toBe(0);
    expect(onValueChange).toHaveBeenLastCalledWith("45");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(radio("30 min"));
    expect(radio("30 min").getAttribute("aria-checked")).toBe("true");

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(radio("1 h"));

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(radio("30 min"));

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(radio("1 h"));
    expect(onValueChange).toHaveBeenLastCalledWith("60");
  });

  it("saute les options désactivées", async () => {
    const user = userEvent.setup();
    render(
      <SegmentedControl
        aria-label="Type de nouvelle"
        options={[
          { value: "one", label: "Un enfant" },
          { value: "many", label: "Plusieurs enfants", disabled: true },
          { value: "all", label: "Vie du relais (tous)" },
        ]}
        defaultValue="one"
      />,
    );
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(radio("Vie du relais (tous)"));
  });

  it("sélectionne au clic et reste piloté par value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Durée"
        options={durations}
        value="30"
        onValueChange={onValueChange}
      />,
    );
    await user.click(radio("1 h"));
    expect(onValueChange).toHaveBeenCalledWith("60");
    expect(radio("30 min").getAttribute("aria-checked")).toBe("true");
  });

  it("met la valeur dans un champ caché pour les formulaires", () => {
    const { container } = render(
      <SegmentedControl aria-label="Durée" name="duree" options={durations} defaultValue="45" />,
    );
    const hidden = container.querySelector<HTMLInputElement>('input[type="hidden"][name="duree"]');
    expect(hidden?.value).toBe("45");
  });

  it("garde un arrêt de tabulation sans valeur choisie", () => {
    render(<SegmentedControl aria-label="Durée" options={durations} />);
    expect(radio("30 min").tabIndex).toBe(0);
    expect(radio("45 min").tabIndex).toBe(-1);
  });
});
