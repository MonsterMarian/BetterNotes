"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/components/providers/store-provider";
import { setPrefs, usePrefs } from "@/components/providers/use-prefs";
import { exportBackup, needsBackupNudge } from "@/lib/backup";
import { noteCount } from "@/lib/notes";

/**
 * Upozornění nad seznamem: selhané ukládání, nebo dlouho žádná záloha.
 * Poznámky leží jen v telefonu, takže tohle je jediné místo, kde se
 * uživatel dozví, že o ně může přijít - dřív, než se to stane.
 */
export function BackupBanner() {
  const { state, saveFailed } = useStore();
  const prefs = usePrefs();
  const [busy, setBusy] = React.useState(false);

  const nudge = !saveFailed && needsBackupNudge(prefs, noteCount(state));
  if (!saveFailed && !nudge) return null;

  const backup = async () => {
    setBusy(true);
    try {
      // Úspěch si zapíše `exportBackup` sám (lastBackupAt) a lišta zmizí.
      await exportBackup(state);
    } catch (err) {
      // Zavřená nabídka sdílení taky končí chybou; lišta prostě zůstane.
      console.error("Záloha se nepovedla:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="anim-enter flex flex-col gap-3 rounded-lg-plus bg-surface-container p-4">
      <p className="flex gap-3 text-body-md text-on-surface">
        {saveFailed ? <TriangleAlert className="mt-0.5 size-5 shrink-0 text-error" /> : null}
        {saveFailed
          ? "Poznámky se nedaří uložit. Telefon je možná plný. Zálohuj si je a uvolni místo."
          : "Tvoje poznámky jsou jen v tomhle telefonu. Pošli si zálohu, ať o ně nepřijdeš."}
      </p>
      <div className="flex justify-end gap-2">
        {nudge ? (
          <Button variant="text" onClick={() => setPrefs({ backupNudgeDismissedAt: new Date().toISOString() })}>
            Později
          </Button>
        ) : null}
        <Button variant="tonal" disabled={busy} onClick={() => void backup()}>
          Zálohovat
        </Button>
      </div>
    </div>
  );
}
