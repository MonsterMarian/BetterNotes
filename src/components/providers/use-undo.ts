"use client";

import * as React from "react";
import { useStore } from "@/components/providers/store-provider";
import { useToast } from "@/components/providers/toast-provider";
import { haptic } from "@/lib/native";

/**
 * Akce se snackbarem "Zpět" místo potvrzovacího dialogu.
 *
 * Před akcí si vezme snímek dotčených poznámek; "Zpět" je vrátí přesně
 * v té podobě, i s razítky - vrácená poznámka se objeví tam, kde byla.
 */
export function useUndo(): (opts: { message: string; ids: string[]; run: () => void }) => void {
  const { snapshot, putNotes } = useStore();
  const { toast } = useToast();
  return React.useCallback(
    ({ message, ids, run }) => {
      const prev = snapshot(ids);
      run();
      haptic("tick");
      toast({ title: message, action: { label: "Zpět", onClick: () => putNotes(prev) } });
    },
    [snapshot, putNotes, toast],
  );
}
