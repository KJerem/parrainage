import type { RelaisHome } from "@parrainage/contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  CameraIcon,
  ChevronRightIcon,
  FileLinesIcon,
  LockIcon,
  MessageIcon,
  UserPlusIcon,
} from "@/components/ui";
import { PendingList } from "./offline-status";
import { relaisTodos, type RelaisTodo } from "./relais-labels";

const QUICK_TILE =
  "flex min-h-19 flex-col items-center justify-center gap-1.5 rounded-14 border border-line bg-white px-2 text-center text-14 font-bold text-ink no-underline hover:text-ink";

function QuickTile({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className={QUICK_TILE}>
      <span className="text-brand-700">{icon}</span>
      {label}
    </Link>
  );
}

const badgeTone: Readonly<Record<RelaisTodo["tone"], string>> = {
  danger: "bg-danger-100 text-danger-600",
  warning: "bg-accent-100 text-accent-700",
  info: "bg-info-100 text-info-600",
};

/** Ligne d'une tâche ou d'une alerte : pastille, titre, précision, chevron. */
export function TodoRow({ todo }: { todo: RelaisTodo }) {
  return (
    <Link
      href={todo.href}
      className="flex min-h-11 items-center gap-3 px-4 py-3.5 text-ink no-underline hover:text-ink"
    >
      <span
        aria-hidden="true"
        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-13 font-bold ${badgeTone[todo.tone]}`}
      >
        {todo.badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-15 font-bold">{todo.title}</span>
        <span
          className={
            todo.tone === "danger"
              ? "block text-13 font-semibold text-danger-600"
              : "block text-13 text-muted"
          }
        >
          {todo.detail}
        </span>
      </span>
      <ChevronRightIcon size={18} className="shrink-0 text-muted" />
    </Link>
  );
}

const WEEK_TODOS = 3;

/** Relais.dc.html : actions rapides, à faire cette semaine, en attente d'envoi. */
export function RelaisHomeMobile({ home }: { home: RelaisHome }) {
  const todos = relaisTodos(home);
  const shown = [
    ...todos.filter((todo) => todo.kind === "stale").slice(0, WEEK_TODOS - 1),
    ...todos.filter((todo) => todo.kind === "bulletins"),
    ...todos.filter((todo) => todo.kind === "call"),
    ...todos.filter((todo) => todo.kind === "session"),
  ];
  return (
    <div className="flex flex-col gap-5 md:hidden">
      <section aria-label="Actions rapides" className="grid grid-cols-2 gap-3">
        <Link
          href="/relais/publier"
          className="col-span-2 flex min-h-16 items-center justify-center gap-2.5 rounded-14 bg-accent-500 text-17 font-extrabold text-ink no-underline hover:text-ink"
        >
          <CameraIcon size={22} />
          Publier une nouvelle
        </Link>
        <QuickTile
          href="/relais/enfants/nouveau"
          icon={<UserPlusIcon size={22} />}
          label="Ajouter un enfant"
        />
        <QuickTile
          href="/relais/resultats"
          icon={<FileLinesIcon size={22} />}
          label="Saisir des résultats"
        />
        <QuickTile href="/relais/messages" icon={<MessageIcon size={22} />} label="Écrire" />
        <QuickTile
          href="/relais/sessions"
          icon={<LockIcon size={22} />}
          label="Ouvrir une session élève"
        />
      </section>
      {shown.length > 0 ? (
        <section aria-labelledby="a-faire-semaine" className="flex flex-col gap-2.5">
          <h2 id="a-faire-semaine" className="m-0 text-17 font-bold">
            À faire cette semaine
          </h2>
          <div className="divide-y divide-line-soft overflow-hidden rounded-14 border border-line bg-white">
            {shown.map((todo) => (
              <TodoRow key={todo.key} todo={todo} />
            ))}
          </div>
        </section>
      ) : null}
      <PendingList />
    </div>
  );
}
