import type { ConversationDetail, ConversationMessage, MessagePage } from "@parrainage/contracts";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageThread } from "./message-thread";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));

const now = "2026-10-31T10:00:00.000Z";

const conversation: ConversationDetail = {
  id: "conv-aicha",
  kind: "SPONSORSHIP",
  access: "participant",
  subject: null,
  counterpart: {
    kind: "child",
    id: "seed-child-aicha",
    name: "Aïcha S.",
    shortName: "Aïcha",
    initials: "AS",
    avatarTone: "amber",
    subtitle: "Écrit depuis l'école, avec son relais M. Koffi",
  },
  childId: "seed-child-aicha",
  lastMessage: null,
  lastMessageAt: "2026-10-30T15:00:00.000Z",
  unreadCount: 1,
  moderated: true,
  canWrite: true,
  canEncourage: true,
};

const message = (id: string, createdAt: string, body: string, side: "me" | "them" = "them") =>
  ({
    id,
    kind: "TEXT",
    side,
    author:
      side === "me"
        ? { kind: "parrain", name: "Claire M.", initials: "CM", avatarTone: "info" }
        : { kind: "child", name: "Aïcha S.", initials: "AS", avatarTone: "amber" },
    body,
    masked: false,
    attachments: [],
    sentFrom: side === "me" ? "WEB" : "SCHOOL_SESSION",
    createdAt,
    status: side === "me" ? "lu" : null,
    moderationReason: null,
  }) satisfies ConversationMessage;

const page: MessagePage = {
  items: [
    message("m2", "2026-10-14T15:30:00.000Z", "Bravo pour ta rentrée !", "me"),
    message("m3", "2026-10-30T15:00:00.000Z", "Bonjour tata Claire !"),
  ],
  nextCursor: "curseur-1",
  now,
};

const fetchMock = vi.fn();

beforeEach(() => {
  mocks.refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("MessageThread", () => {
  it("affiche le fil avec ses séparateurs et le marque comme lu", async () => {
    fetchMock.mockResolvedValueOnce(json({ total: 1 }));
    render(
      <MessageThread
        conversation={conversation}
        page={page}
        timeZone="Europe/Paris"
        variant="parrain"
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Aïcha S." })).toBeTruthy();
    const log = screen.getByRole("log", { name: "Messages" });
    expect(within(log).getByText("14 octobre")).toBeTruthy();
    expect(within(log).getByText("Hier")).toBeTruthy();
    // « Lu » n'est rappelé que sous le dernier message du fil.
    expect(within(log).queryByText("Lu par Aïcha")).toBeNull();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/conversations/conv-aicha/read");
    expect(fetchMock.mock.calls[0]![1].method).toBe("POST");
  });

  it("charge les messages plus anciens au-dessus, sans doublon", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(json({ total: 0 })).mockResolvedValueOnce(
      json({
        items: [
          message("m1", "2026-09-02T10:00:00.000Z", "Merci pour le cahier !"),
          message("m2", "2026-10-14T15:30:00.000Z", "Bravo pour ta rentrée !", "me"),
        ],
        nextCursor: null,
        now,
      }),
    );
    render(
      <MessageThread
        conversation={conversation}
        page={page}
        timeZone="Europe/Paris"
        variant="parrain"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Plus anciens" }));
    const log = screen.getByRole("log", { name: "Messages" });
    await waitFor(() => expect(within(log).getAllByRole("article")).toHaveLength(3));
    expect(within(log).getAllByRole("article")[0]!.textContent).toContain("Merci pour le cahier !");
    expect(within(log).getByText("2 septembre")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Plus anciens" })).toBeNull();
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      "/api/conversations/conv-aicha/messages?cursor=curseur-1",
    );
  });

  it("ne marque pas comme lu un fil masqué sous md (page de liste)", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    render(
      <MessageThread
        conversation={conversation}
        page={page}
        timeZone="Europe/Paris"
        variant="parrain"
        markReadFrom="md"
      />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sans droit d'écriture, explique pourquoi au lieu d'afficher le champ", () => {
    fetchMock.mockResolvedValue(json({ total: 0 }));
    render(
      <MessageThread
        conversation={{ ...conversation, canWrite: false, unreadCount: 0 }}
        page={{ ...page, nextCursor: null }}
        timeZone="Africa/Lome"
        variant="relais"
        titleAs="h2"
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByText("Vous suivez cette conversation : vous ne pouvez pas y écrire."),
    ).toBeTruthy();
  });
});
