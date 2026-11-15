"use client";

import { ActionList } from "@/components/ui/action-list";
import { Dialog } from "@/components/ui/dialog";
import { TEMPLATES, type NoteTemplate } from "@/lib/templates";

/** Výběr šablony pro novou poznámku - prázdná stránka je u nováčků největší brzda. */
export function TemplateSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (template: NoteTemplate) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Šablony">
      <ActionList
        items={TEMPLATES.map((t) => ({
          id: t.id,
          label: t.label,
          icon: <span data-tone={t.tone} className="block size-4 rounded-full bg-[var(--note-accent)]" />,
          onSelect: () => {
            onOpenChange(false);
            onPick(t);
          },
        }))}
      />
    </Dialog>
  );
}
