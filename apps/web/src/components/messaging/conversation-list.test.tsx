import type { ConversationMessage, ConversationSummary } from "@parrainage/contracts";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MessageItem } from "./chat-bubble";
import { ConversationList } from "./conversation-list";

const now = "2026-10-31T10:00:00.000Z";

const summary = (
  id: string,
  name: string,
  kind: ConversationSummary["counterpart"]["kind"],
  patch: Partial<ConversationSummary> = {},
): ConversationSummary => ({
  id,
  kind: kind === "child" ? "SPONSORSHIP" : kind === "relais" ? "PARRAIN_RELAIS" : "PARRAIN_BUREAU",
  access: "participant",
  subject: null,
  counterpart: {
    kind,
    id: kind === "bureau" ? null : `${id}-person`,
    name,
    shortName: name.split(" ")[0]!,
    initials: name.slice(0, 2).toUpperCase(),
    avatarTone: "amber",
    subtitle: null,
  },
  childId: null,
  lastMessage: {
    body: `Dernier message de ${name}`,
    mine: false,
    kind: "TEXT",
    attachmentCount: 0,
    createdAt: "2026-10-30T15:00:00.000Z",
    status: null,
  },
  lastMessageAt: "2026-10-30T15:00:00.000Z",
  unreadCount: 0,
  ...patch,
});

afterEach(cleanup);

describe("ConversationList", () => {
  const items = [
    summary("c1", "Aïcha S.", "child"),
    summary("c2", "Kofi A.", "child", { lastMessageAt: "2026-09-02T15:00:00.000Z" }),
    summary("c3", "M. Koffi", "relais", { unreadCount: 1 }),
  ];

  it("liste les conversations comme P-Messages : nom, aperçu, date ou non-lus", () => {
    render(
      <ConversationList
        items={items}
        now={now}
        timeZone="Europe/Paris"
        basePath="/parrain/messages"
        selectedId="c1"
        searchable
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Conversations" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/parrain/messages/c1",
      "/parrain/messages/c2",
      "/parrain/messages/c3",
    ]);
    expect(links[0]!.getAttribute("aria-current")).toBe("page");
    expect(links[1]!.getAttribute("aria-current")).toBeNull();
    expect(links[0]!.textContent).toContain("Aïcha");
    expect(links[0]!.textContent).toContain("hier");
    expect(links[1]!.textContent).toContain("2 sept.");
    expect(links[2]!.textContent).toContain("M. Koffi · relais");
    expect(within(links[2]!).getByText("1 non lu")).toBeTruthy();
  });

  it("filtre localement, sans tenir compte des accents", async () => {
    const user = userEvent.setup();
    render(
      <ConversationList
        items={items}
        now={now}
        timeZone="Europe/Paris"
        basePath="/parrain/messages"
        searchable
      />,
    );
    await user.type(screen.getByLabelText("Rechercher"), "aicha");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    await user.clear(screen.getByLabelText("Rechercher"));
    await user.type(screen.getByLabelText("Rechercher"), "zzz");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("Aucune conversation ne correspond à votre recherche.")).toBeTruthy();
  });
});

describe("MessageItem", () => {
  const message = (patch: Partial<ConversationMessage>): ConversationMessage => ({
    id: "m1",
    kind: "TEXT",
    side: "me",
    author: { kind: "parrain", name: "Claire M.", initials: "CM", avatarTone: "info-strong" },
    body: "Bonjour Aïcha",
    masked: false,
    attachments: [],
    sentFrom: "WEB",
    createdAt: now,
    status: "en_relecture",
    moderationReason: null,
    ...patch,
  });

  it("affiche le suivi de ses propres messages", () => {
    const { rerender } = render(
      <MessageItem message={message({})} recipient="Aïcha" srIntro="Vous :" />,
    );
    expect(screen.getByText("En relecture")).toBeTruthy();
    rerender(<MessageItem message={message({ status: "remis" })} recipient="Aïcha" srIntro="" />);
    expect(screen.getByText("Remis à Aïcha")).toBeTruthy();
    rerender(
      <MessageItem
        message={message({ status: "retenu", moderationReason: "Contact direct hors plateforme" })}
        recipient="Aïcha"
        srIntro=""
      />,
    );
    expect(
      screen.getByText(/Retenu par l'association : Contact direct hors plateforme/),
    ).toBeTruthy();
  });

  it("montre les pièces jointes : photo de démonstration et bulletin à télécharger", () => {
    render(
      <MessageItem
        message={message({
          side: "them",
          status: null,
          attachments: [
            {
              id: "photo",
              kind: "PHOTO",
              status: "PLACEHOLDER",
              label: "Photo de la classe",
              durationSec: null,
              mimeType: "image/jpeg",
            },
            {
              id: "bulletin",
              kind: "BULLETIN",
              status: "READY",
              label: "Bulletin T1 — 2026-27",
              durationSec: null,
              mimeType: "application/pdf",
            },
          ],
        })}
        recipient="Claire"
        srIntro="Aïcha S., hier :"
      />,
    );
    expect(screen.getByText("Photo de la classe")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /^Bulletin T1 — 2026-27 \(PDF\)\s*\(télécharger\)$/ })
        .getAttribute("href"),
    ).toBe("/api/media/bulletin?download=1");
    expect(screen.queryByText(/Remis|En relecture/)).toBeNull();
  });
});
