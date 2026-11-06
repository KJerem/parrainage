"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { Tab, TabList, Tabs } from "@/components/ui/tabs";
import { relaisTabLabels, visibleRelaisTabs, type RelaisTab } from "./relais-tab";

/** Filtre des conversations : chaque onglet ouvre la liste correspondante. */
export function RelaisConversationTabs({ current }: { current: RelaisTab }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useOptimistic(current);

  function select(value: string) {
    startTransition(() => {
      setSelected(value as RelaisTab);
      router.push(`/relais/messages?onglet=${encodeURIComponent(value)}`, { scroll: false });
    });
  }

  return (
    <Tabs value={selected} onValueChange={select}>
      <TabList aria-label="Filtrer les conversations" className="p-2.5">
        {visibleRelaisTabs().map((tab) => (
          <Tab key={tab} value={tab}>
            {relaisTabLabels[tab]}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}
