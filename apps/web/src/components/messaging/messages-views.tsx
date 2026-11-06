import type {
  ConversationDetail,
  ConversationList as ConversationListData,
  MessagePage,
} from "@parrainage/contracts";
import type { ReactNode } from "react";
import { ListDetail } from "@/components/layout/page-grids";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { PARRAIN_TIME_ZONE, RELAIS_TIME_ZONE } from "@/lib/format";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import type { RelaisTab } from "./relais-tab";
import { RelaisConversationTabs } from "./relais-tabs";

export type OpenConversation = { detail: ConversationDetail; page: MessagePage };

/** Page de liste (`index`) ou d'une conversation (`thread`) : sous md, une seule colonne. */
type ViewMode = "index" | "thread";

// Hauteurs fixes (plan §6) : liste et fil tiennent dans l'écran, sous l'en-tête de la coquille.
// Parrain : en-tête de 69 px (≥ lg) ou 129 px (pastilles sur deux lignes), marges de 24 px.
const parrainHeights = {
  index: "md:-mt-2 md:-mb-8 md:h-[calc(100dvh-177px)] md:min-h-[560px] lg:h-[calc(100dvh-117px)]",
  // Sous md, au moins la hauteur du fil et de la zone de réponse : un petit écran défile
  // plutôt que de rogner le bouton « Envoyer ».
  thread:
    "-mt-2 -mb-8 h-[calc(100dvh-181px)] min-h-[600px] md:h-[calc(100dvh-177px)] md:min-h-[560px] lg:h-[calc(100dvh-117px)]",
} as const;

// Relais : titre « Messages » (44 px) et 20 px d'écart ; ≥ lg marges de 32 px, md–lg barre
// supérieure de 56 px et marges de 24 px, < md sous-en-tête blanc et barre du bas.
const relaisHeights = {
  index: "md:h-[calc(100dvh-168px)] md:min-h-[520px] lg:h-[calc(100dvh-128px)]",
  thread:
    "h-[calc(100dvh-198px)] min-h-[480px] md:h-[calc(100dvh-168px)] md:min-h-[520px] lg:h-[calc(100dvh-128px)]",
} as const;

function NoConversation({ children }: { children: ReactNode }) {
  return (
    <Card padding="none" className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={<MessageIcon size={26} />}
        title="Aucune conversation ouverte"
        description={children}
      />
    </Card>
  );
}

export type ParrainMessagesViewProps = {
  mode: ViewMode;
  list: ConversationListData;
  /** Conversation affichée : celle de l'adresse, ou la plus récente sur la page de liste. */
  open: OpenConversation | null;
};

/** P-Messages : liste des conversations et fil, côte à côte à partir de md. */
export function ParrainMessagesView({ mode, list, open }: ParrainMessagesViewProps) {
  const basePath = "/parrain/messages";
  const thread = open ? (
    <MessageThread
      conversation={open.detail}
      page={open.page}
      timeZone={PARRAIN_TIME_ZONE}
      variant="parrain"
      titleAs={mode === "thread" ? "h1" : "h2"}
      backHref={mode === "thread" ? basePath : undefined}
      markReadFrom={mode === "index" ? "md" : "always"}
    />
  ) : (
    <NoConversation>Choisissez une conversation dans la liste.</NoConversation>
  );

  if (list.items.length === 0 && !open) {
    return (
      <>
        <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-32">Messages</h1>
        <Card padding="none">
          <EmptyState
            icon={<MessageIcon size={26} />}
            title="Pas encore de conversation"
            description="Vos échanges avec vos filleuls, leur relais et l'association apparaîtront ici."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {mode === "index" ? (
        // Le titre de la page : visible sous md (liste seule), lu seulement au-delà.
        <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] md:sr-only">Messages</h1>
      ) : null}
      <ListDetail
        align="stretch"
        mobile={mode === "index" ? "list" : "detail"}
        className={parrainHeights[mode]}
        list={
          <ConversationList
            items={list.items}
            now={list.now}
            timeZone={PARRAIN_TIME_ZONE}
            basePath={basePath}
            selectedId={open?.detail.id}
            selection={mode === "index" ? "md" : "page"}
            searchable
          />
        }
      >
        {thread}
      </ListDetail>
    </>
  );
}

export type RelaisMessagesViewProps = {
  mode: ViewMode;
  tab: RelaisTab;
  /** Conversations de l'onglet. */
  items: ConversationListData["items"];
  now: string;
  open: OpenConversation | null;
  /** Bouton « Nouveau message ». */
  action: ReactNode;
};

/** RW-Messages : titre, onglets Parrains / Bureau, liste et fil. */
export function RelaisMessagesView({
  mode,
  tab,
  items,
  now,
  open,
  action,
}: RelaisMessagesViewProps) {
  const basePath = "/relais/messages";
  return (
    <div className="flex flex-col gap-5">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3",
          mode === "thread" && "max-md:hidden",
        )}
      >
        {/* Sous md, le sous-en-tête blanc de la coquille porte le titre. */}
        <h1 className="m-0 hidden text-30 font-extrabold md:block">Messages</h1>
        {action}
      </div>
      <ListDetail
        align="stretch"
        listWidth={300}
        mobile={mode === "index" ? "list" : "detail"}
        className={relaisHeights[mode]}
        list={
          <ConversationList
            items={items}
            now={now}
            timeZone={RELAIS_TIME_ZONE}
            basePath={basePath}
            selectedId={open?.detail.id}
            selection={mode === "index" ? "md" : "page"}
            compact
            header={<RelaisConversationTabs current={tab} />}
            emptyText={
              tab === "bureau"
                ? "Aucun échange avec le bureau pour l'instant."
                : "Aucun échange avec les parrains pour l'instant."
            }
          />
        }
      >
        {open ? (
          <MessageThread
            conversation={open.detail}
            page={open.page}
            timeZone={RELAIS_TIME_ZONE}
            variant="relais"
            titleAs="h2"
            markReadFrom={mode === "index" ? "md" : "always"}
          />
        ) : (
          <NoConversation>Choisissez une conversation dans la liste.</NoConversation>
        )}
      </ListDetail>
    </div>
  );
}
