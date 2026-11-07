import {
  automaticAlertLabel,
  charterRule,
  type ModerationDetail,
  type ModerationQueue,
  type ModerationSummary,
} from "@parrainage/contracts";
import { ListDetail } from "@/components/layout";
import { ArrowLeftIcon, Button, Card, Chip, EmptyState, Notice, ShieldIcon } from "@/components/ui";
import { HighlightedBody } from "./highlighted-body";
import { MessageReview, ReviewAttachments } from "./message-review";
import {
  alertChipVariant,
  decidedLabel,
  detailContextLabel,
  historyLabel,
  lastNewsLabel,
  moderationAlert,
  partiesLabel,
} from "./moderation-labels";
import { ModerationQueueList } from "./queue-list";

function DetailCard({ detail }: { detail: ModerationDetail }) {
  const alert = moderationAlert(detail.alertTypes, detail.manualFlags);
  const headline = automaticAlertLabel(detail.alertTypes) ?? (alert.flagged ? alert.label : null);
  const pending = detail.moderationStatus === "PENDING";
  return (
    <section
      aria-labelledby="message-relu"
      className="flex flex-col gap-4 rounded-16 border border-line bg-white p-6 max-sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="message-relu" className="m-0 text-20 font-bold [overflow-wrap:anywhere]">
            {partiesLabel(detail)}
          </h2>
          <div className="text-13 text-muted">{detailContextLabel(detail)}</div>
        </div>
        {headline ? (
          <Chip size="md" variant={alertChipVariant[alert.tone]}>
            {headline}
          </Chip>
        ) : null}
      </div>
      <div className="rounded-12 border border-line-soft bg-surface-alt p-[18px] text-16 leading-[1.6]">
        {detail.body.trim() === "" ? (
          <p className="m-0 text-15 text-muted">Ce message ne contient que des pièces jointes.</p>
        ) : (
          <HighlightedBody body={detail.body} spans={detail.spans} />
        )}
      </div>
      <ReviewAttachments detail={detail} />
      {pending ? (
        <MessageReview key={detail.id} detail={detail} />
      ) : (
        <Notice variant="brand" title={decidedLabel(detail.moderationStatus)}>
          {detail.moderationReason ? <>Motif : {detail.moderationReason}.</> : null}
          {detail.redactedBody ? (
            <span className="mt-1 block [overflow-wrap:anywhere] whitespace-pre-wrap">
              Version transmise : {detail.redactedBody}
            </span>
          ) : null}
        </Notice>
      )}
    </section>
  );
}

function DetailAside({ detail }: { detail: ModerationDetail }) {
  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex flex-[1_1_240px] flex-col gap-1.5 rounded-16 border border-line bg-white p-[18px]">
        <strong className="text-15">Historique du binôme</strong>
        <span className="text-14 text-ink-soft">{historyLabel(detail.history)}</span>
        <span className="text-14 text-ink-soft">{lastNewsLabel(detail)}</span>
      </div>
      <div className="flex-[1_1_240px] rounded-16 bg-accent-100 p-[18px] text-14 leading-[1.5] text-accent-900">
        <strong className="mb-1 block text-ink">Règle de la charte</strong>
        {charterRule(detail.alertTypes, detail.manualFlags)}
      </div>
    </div>
  );
}

/**
 * B-Moderation : file et message relu côte à côte à partir de md. En dessous, `list` n'affiche
 * que la file et `detail` que le message, avec un retour vers la file.
 */
export function ModerationView({
  queue,
  summary,
  detail,
  mobile,
}: {
  queue: ModerationQueue;
  summary: ModerationSummary;
  detail: ModerationDetail | null;
  mobile: "list" | "detail";
}) {
  return (
    <>
      <h1 className="m-0 text-30 font-extrabold max-sm:text-24">Modération</h1>
      {mobile === "detail" ? (
        <Button
          href="/bureau/moderation"
          variant="ghost"
          leftIcon={<ArrowLeftIcon size={18} />}
          className="self-start md:hidden"
        >
          Retour à la file
        </Button>
      ) : null}
      <ListDetail
        mobile={mobile}
        list={<ModerationQueueList queue={queue} summary={summary} selectedId={detail?.id} />}
      >
        {detail ? (
          <>
            <DetailCard detail={detail} />
            <DetailAside detail={detail} />
          </>
        ) : (
          <Card padding="none">
            <EmptyState
              icon={<ShieldIcon size={26} />}
              title="La file est vide"
              description="Tous les messages ont été relus. Les prochains apparaîtront ici dès leur envoi."
            />
          </Card>
        )}
      </ListDetail>
    </>
  );
}
