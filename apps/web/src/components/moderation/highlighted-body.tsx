import { alertTypeLabels, splitByAlerts, type AlertSpan } from "@parrainage/contracts";
import { Fragment } from "react";

/**
 * Texte d'un message, passages repérés surlignés. Rendu en éléments React, jamais en HTML brut :
 * un message reste du texte, quoi que son auteur y ait écrit.
 */
export function HighlightedBody({ body, spans }: { body: string; spans: readonly AlertSpan[] }) {
  return (
    <p className="m-0 [overflow-wrap:anywhere] whitespace-pre-wrap">
      {splitByAlerts(body, spans).map((segment, index) =>
        segment.alert ? (
          <mark
            key={index}
            title={alertTypeLabels[segment.alert]}
            className="rounded-4 bg-danger-100 px-1 font-bold text-danger-600"
          >
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </p>
  );
}
