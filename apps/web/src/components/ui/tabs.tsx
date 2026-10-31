"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type TabsVariant = "default" | "kid";

type TabsContextValue = {
  baseId: string;
  value: string | undefined;
  select: (value: string) => void;
  variant: TabsVariant;
  panels: ReadonlySet<string>;
  registerPanel: (value: string) => () => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string) {
  const context = use(TabsContext);
  if (!context) throw new Error(`<${component}> doit être placé dans <Tabs>.`);
  return context;
}

const tabId = (baseId: string, value: string) => `${baseId}-onglet-${value}`;
const panelId = (baseId: string, value: string) => `${baseId}-panneau-${value}`;

export type TabsProps = Omit<HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: TabsVariant;
};

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  variant = "default",
  children,
  ...props
}: TabsProps) {
  const baseId = useId();
  const [internal, setInternal] = useState(defaultValue);
  const [panels, setPanels] = useState<ReadonlySet<string>>(() => new Set());
  const current = value !== undefined ? value : internal;

  const select = useCallback(
    (next: string) => {
      if (value === undefined) setInternal(next);
      if (next !== current) onValueChange?.(next);
    },
    [value, current, onValueChange],
  );

  const registerPanel = useCallback((panel: string) => {
    setPanels((prev) => new Set(prev).add(panel));
    return () =>
      setPanels((prev) => {
        const next = new Set(prev);
        next.delete(panel);
        return next;
      });
  }, []);

  const context = useMemo(
    () => ({ baseId, value: current, select, variant, panels, registerPanel }),
    [baseId, current, select, variant, panels, registerPanel],
  );

  return (
    <TabsContext value={context}>
      <div {...props}>{children}</div>
    </TabsContext>
  );
}

export type TabListProps = HTMLAttributes<HTMLDivElement> & {
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

export function TabList({ className, onKeyDown, ...props }: TabListProps) {
  const { select, variant } = useTabs("TabList");

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    const index = tabs.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
        next = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = tabs[next];
    target.focus();
    if (target.dataset.value) select(target.dataset.value);
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn("flex", variant === "kid" ? "flex-wrap gap-3" : "gap-1", className)}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export type TabProps = Omit<HTMLAttributes<HTMLButtonElement>, "onClick"> & {
  value: string;
  disabled?: boolean;
  children: ReactNode;
};

export function Tab({ value, disabled, className, children, ...props }: TabProps) {
  const { baseId, value: current, select, variant, panels } = useTabs("Tab");
  const selected = current === value;
  return (
    <button
      type="button"
      role="tab"
      id={tabId(baseId, value)}
      data-value={value}
      aria-selected={selected}
      aria-controls={panels.has(value) ? panelId(baseId, value) : undefined}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => select(value)}
      className={cn(
        "cursor-pointer font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variant === "kid"
          ? cn(
              "min-h-14 rounded-16 border-3 px-6 text-18 font-bold",
              selected
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-kid-line bg-white text-ink hover:bg-kid-canvas",
            )
          : cn(
              "min-h-10 rounded-8 px-3 text-14 pointer-coarse:min-h-11",
              selected
                ? "bg-brand-100 text-brand-700"
                : "bg-transparent text-ink-soft hover:bg-canvas",
            ),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export type TabPanelProps = HTMLAttributes<HTMLDivElement> & { value: string };

export function TabPanel({ value, className, ...props }: TabPanelProps) {
  const { baseId, value: current, registerPanel } = useTabs("TabPanel");
  useEffect(() => registerPanel(value), [registerPanel, value]);
  const selected = current === value;
  return (
    <div
      role="tabpanel"
      id={panelId(baseId, value)}
      aria-labelledby={tabId(baseId, value)}
      hidden={!selected}
      tabIndex={0}
      className={className}
      {...props}
    />
  );
}
