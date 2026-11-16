"use client";

import * as React from "react";
import { Cloud as CloudCheck, CloudAlert, CloudUpload } from "lucide-react";
import { getOffStatus, getSyncStatus, subscribeSync, type SyncStatus } from "@/lib/sync";
import { cn } from "@/lib/utils";

export function useSyncStatus(): SyncStatus {
  return React.useSyncExternalStore(subscribeSync, getSyncStatus, getOffStatus);
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

export function syncStatusText(s: SyncStatus): string {
  switch (s.kind) {
    case "off":
      return "Nepřihlášeno - poznámky jsou jen v telefonu.";
    case "syncing":
      return "Ukládám do databáze…";
    case "ok":
      return `Vše uloženo v databázi · ${time(s.at)}`;
    case "error":
      return `Neuloženo: ${s.message} Zkusí se to znovu.`;
  }
}

/** Malá ikonka v liště: uloženo / ukládá se / chyba. Nepřihlášenému nic. */
export function SyncIcon({ className }: { className?: string }) {
  const s = useSyncStatus();
  if (s.kind === "off") return null;
  const Icon = s.kind === "ok" ? CloudCheck : s.kind === "error" ? CloudAlert : CloudUpload;
  return (
    <span
      role="status"
      aria-label={syncStatusText(s)}
      title={syncStatusText(s)}
      className={cn(
        "inline-flex size-10 items-center justify-center",
        s.kind === "error" ? "text-error" : "text-on-surface-variant",
        s.kind === "syncing" && "animate-pulse",
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
