import { detectAlerts } from "@parrainage/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HighlightedBody } from "./highlighted-body";

describe("HighlightedBody", () => {
  it("surligne exactement les passages repérés", () => {
    const body = "Écris sur WhatsApp au 06 39 98 12 34, à bientôt";
    const { container } = render(<HighlightedBody body={body} spans={detectAlerts(body).spans} />);
    const marks = [...container.querySelectorAll("mark")];
    expect(marks.map((mark) => mark.textContent)).toEqual(["WhatsApp", "06 39 98 12 34"]);
    expect(marks[1]?.getAttribute("title")).toBe("Numéro de téléphone");
    expect(container.textContent).toBe(body);
  });

  it("n'interprète jamais le texte comme du HTML", () => {
    const body = '<img src=x onerror="alert(1)"> mon numéro 06 39 98 12 34';
    const { container } = render(<HighlightedBody body={body} spans={detectAlerts(body).spans} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe(body);
  });

  it("rend un texte sans alerte sans surlignage", () => {
    render(<HighlightedBody body="Bonjour Claire" spans={[]} />);
    expect(screen.getByText("Bonjour Claire").querySelector("mark")).toBeNull();
  });
});
