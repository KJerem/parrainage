import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProgressBar } from "./progress-bar";

afterEach(cleanup);

describe("ProgressBar", () => {
  it("expose les valeurs ARIA et le libellé visible", () => {
    render(
      <ProgressBar label="CM2 · 1er trimestre" value={13.4} max={20} valueLabel="13,4 / 20" />,
    );
    const bar = screen.getByRole("progressbar", { name: "CM2 · 1er trimestre" });
    expect(bar.getAttribute("aria-valuenow")).toBe("13.4");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("20");
    expect(bar.getAttribute("aria-valuetext")).toBe("13,4 / 20");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("67%");
  });

  it("borne la valeur entre 0 et le maximum", () => {
    render(<ProgressBar aria-label="Justifié" value={140} />);
    const bar = screen.getByRole("progressbar", { name: "Justifié" });
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
  });

  it("applique la taille et le ton", () => {
    render(<ProgressBar aria-label="Kpalimé" value={47} size="lg" tone="accent" />);
    const bar = screen.getByRole("progressbar", { name: "Kpalimé" });
    expect(bar.className).toContain("h-2.5");
    expect(bar.className).toContain("bg-brand-100");
    expect((bar.firstElementChild as HTMLElement).className).toContain("bg-accent-500");
  });
});
