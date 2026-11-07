import type { ReactNode } from "react";
import { ArrowLeftIcon, Button, Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Rubrique de la navigation livrée par une phase suivante : page honnête plutôt qu'un 404. */
export function ComingSoon({
  title,
  description,
  icon,
  backHref,
  backLabel,
  titleClassName,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  backHref: string;
  backLabel: string;
  /** Sous md, le relais a déjà le titre dans son sous-en-tête. */
  titleClassName?: string;
}) {
  return (
    <>
      <h1
        className={cn("m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-32", titleClassName)}
      >
        {title}
      </h1>
      <Card padding="none">
        <EmptyState
          icon={icon}
          title="Cette rubrique arrive bientôt"
          description={description}
          action={
            <Button href={backHref} variant="secondary" leftIcon={<ArrowLeftIcon size={18} />}>
              {backLabel}
            </Button>
          }
        />
      </Card>
    </>
  );
}
