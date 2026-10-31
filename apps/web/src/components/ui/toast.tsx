"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CloseIcon } from "./icons";

type ToastAction = { label: string; onClick: () => void };

type ToastItem = {
  id: number;
  message: ReactNode;
  action?: ToastAction;
  duration: number;
};

export type ToastOptions = {
  action?: ToastAction;
  /** En millisecondes ; 0 garde le message jusqu'à sa fermeture. */
  duration?: number;
};

const EMPTY: ToastItem[] = [];
let items: ToastItem[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function toast(message: ReactNode, options: ToastOptions = {}) {
  const id = nextId++;
  items = [...items, { id, message, action: options.action, duration: options.duration ?? 5000 }];
  emit();
  return id;
}

export function dismissToast(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type ToastProps = {
  children: ReactNode;
  action?: ToastAction;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
};

export function Toast({ children, action, onClose, closeLabel = "Fermer", className }: ToastProps) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-[480px] items-center gap-3 rounded-12 bg-ink py-2 pr-2 pl-4 text-14 font-semibold text-white shadow-dialog",
        className,
      )}
    >
      <div className="min-w-0 flex-1 py-1.5">{children}</div>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="min-h-9 shrink-0 cursor-pointer rounded-8 px-3 text-13 font-bold text-accent-500 hover:bg-ink-800 focus-visible:outline-accent-500 pointer-coarse:min-h-11"
        >
          {action.label}
        </button>
      ) : null}
      {onClose ? (
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-8 text-side-ink hover:bg-ink-800 hover:text-white focus-visible:outline-accent-500 pointer-coarse:size-11"
        >
          <CloseIcon size={18} />
        </button>
      ) : null}
    </div>
  );
}

function ToastEntry({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || item.duration <= 0) return;
    const timer = window.setTimeout(() => dismissToast(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [paused, item.id, item.duration]);

  return (
    <div
      className="flex w-full justify-center"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Toast action={item.action} onClose={() => dismissToast(item.id)}>
        {item.message}
      </Toast>
    </div>
  );
}

/** À placer une fois par gabarit ; la zone `role="status"` existe avant le premier message. */
export function Toaster({ className }: { className?: string }) {
  const toasts = useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY,
  );
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[max(24px,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {toasts.map((item) => (
        <ToastEntry key={item.id} item={item} />
      ))}
    </div>
  );
}
