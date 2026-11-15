"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowDownUp, Settings, Trash2 } from "lucide-react";
import { ActionList } from "@/components/ui/action-list";
import { Dialog } from "@/components/ui/dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { useStore } from "@/components/providers/store-provider";
import { setPrefs, usePrefs } from "@/components/providers/use-prefs";
import { SORT_ORDERS, archivedNotes, trashedNotes } from "@/lib/notes";

/**
 * Menu hlavní obrazovky: archiv, koš, řazení a nastavení. Vedlejší místa
 * appky, která nemají vlastní tlačítko v liště - ta drží jen to, na co se
 * sahá denně.
 */
export function HomeMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { state } = useStore();
  const { order } = usePrefs();
  const [sortOpen, setSortOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  // Další list se otvírá až po zavření menu, ať Zpět nemusí zavírat dva naráz.
  const then = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} title="Menu">
        <ActionList
          items={[
            {
              id: "archive",
              label: "Archiv",
              icon: <Archive />,
              hint: String(archivedNotes(state).length),
              onSelect: then(() => router.push("/archive/")),
            },
            {
              id: "trash",
              label: "Koš",
              icon: <Trash2 />,
              hint: String(trashedNotes(state).length),
              onSelect: then(() => router.push("/trash/")),
            },
            {
              id: "sort",
              label: "Řazení",
              icon: <ArrowDownUp />,
              hint: SORT_ORDERS.find((o) => o.id === order)?.label,
              onSelect: then(() => setSortOpen(true)),
            },
            {
              id: "settings",
              label: "Nastavení",
              icon: <Settings />,
              onSelect: then(() => setSettingsOpen(true)),
            },
          ]}
        />
      </Dialog>

      <Dialog open={sortOpen} onOpenChange={setSortOpen} title="Řazení">
        <ActionList
          items={SORT_ORDERS.map((o) => ({
            id: o.id,
            label: o.label,
            checked: o.id === order,
            onSelect: () => {
              setPrefs({ order: o.id });
              setSortOpen(false);
            },
          }))}
        />
      </Dialog>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
