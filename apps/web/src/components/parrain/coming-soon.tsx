import type { ReactNode } from "react";
import { ArrowLeftIcon, Button, Card, EmptyState } from "@/components/ui";

/** Rubrique de la navigation livrée par une phase suivante : page honnête plutôt qu'un 404. */
export function ComingSoon({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <>
      <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-32">{title}</h1>
      <Card padding="none">
        <EmptyState
          icon={icon}
          title="Cette rubrique arrive bientôt"
          description={description}
          action={
            <Button href="/parrain" variant="secondary" leftIcon={<ArrowLeftIcon size={18} />}>
              Retour à mes filleuls
            </Button>
          }
        />
      </Card>
    </>
  );
}
