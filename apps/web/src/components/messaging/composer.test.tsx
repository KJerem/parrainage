import type { ConversationMessage } from "@parrainage/contracts";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./composer";

const sentMessage = (body: string): ConversationMessage => ({
  id: "message-1",
  kind: "TEXT",
  side: "me",
  author: { kind: "parrain", name: "Claire M.", initials: "CM", avatarTone: "info-strong" },
  body,
  masked: false,
  attachments: [],
  sentFrom: "WEB",
  createdAt: "2026-10-31T10:00:00.000Z",
  status: "en_relecture",
  moderationReason: null,
});

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderComposer(onSent = vi.fn()) {
  render(
    <Composer
      conversationId="conv-aicha"
      recipient="Aïcha"
      moderated
      variant="parrain"
      onSent={onSent}
    />,
  );
  return onSent;
}

describe("Composer", () => {
  it("reprend les libellés de P-Messages pour un enfant", () => {
    renderComposer();
    const field = screen.getByLabelText("Votre réponse");
    expect(field.getAttribute("placeholder")).toBe("Écrivez à Aïcha…");
    expect(screen.getByRole("button", { name: "Photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Message vidéo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeTruthy();
    expect(
      screen.getByText(/Les messages sont relus par l'association avant d'être remis à Aïcha/),
    ).toBeTruthy();
  });

  it("insère une idée dans la réponse", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.click(screen.getByRole("button", { name: "Quelle est ta matière préférée ?" }));
    const field = screen.getByLabelText<HTMLTextAreaElement>("Votre réponse");
    expect(field.value).toBe("Quelle est ta matière préférée ?");
    expect(document.activeElement).toBe(field);
  });

  it("prévient quand le texte contient un numéro, sans empêcher l'envoi", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.type(screen.getByLabelText("Votre réponse"), "Appelle-moi au 06 39 98 12 34");
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("numéro de téléphone"),
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Envoyer" }).disabled).toBe(false);
  });

  it("envoie le message, vide le champ et rend le focus", async () => {
    const user = userEvent.setup();
    const onSent = renderComposer();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(sentMessage("Bonjour Aïcha !")), { status: 201 }),
    );
    const field = screen.getByLabelText<HTMLTextAreaElement>("Votre réponse");
    await user.type(field, "Bonjour Aïcha !");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/conversations/conv-aicha/messages");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ body: "Bonjour Aïcha !", mediaIds: [] });
    expect(body.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    expect(field.value).toBe("");
    expect(document.activeElement).toBe(field);
  });

  it("garde la même clé d'envoi après un échec, et affiche l'erreur", async () => {
    const user = userEvent.setup();
    const onSent = renderComposer();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 429,
            error: "Too Many Requests",
            message: "Vous avez envoyé beaucoup de messages en peu de temps.",
          }),
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(sentMessage("Coucou")), { status: 201 }));
    await user.type(screen.getByLabelText("Votre réponse"), "Coucou");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Vous avez envoyé beaucoup de messages en peu de temps.",
    );
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    const keys = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(String(init.body)).idempotencyKey,
    );
    expect(keys[0]).toBe(keys[1]);
  });

  it("refuse un envoi vide", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(screen.getByRole("alert").textContent).toBe("Écrivez un message ou joignez une photo.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("côté relais : « Votre message », « Joindre photo ou vidéo », sans idées ni règle", () => {
    render(
      <Composer
        conversationId="conv-claire"
        recipient="Claire"
        moderated={false}
        variant="relais"
        onSent={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Votre message").getAttribute("placeholder")).toBe(
      "Écrire à Claire…",
    );
    expect(screen.getByRole("button", { name: "Joindre photo ou vidéo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Message vidéo" })).toBeNull();
    expect(screen.queryByText("Idées :")).toBeNull();
    expect(screen.queryByText(/Pour sa sécurité/)).toBeNull();
  });
});
