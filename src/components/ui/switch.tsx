"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { haptic } from "@/lib/native";

/**
 * Přepínač M3 (52 × 32) i s popiskem - klikací je celý řádek, ne jen kolejnička.
 * Zapnutý palec naroste a dostane fajfku, poznat to jde i bez barvy.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  const descId = React.useId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? descId : undefined}
      onClick={() => {
        haptic("select");
        onCheckedChange(!checked);
      }}
      className="group flex min-h-14 w-full items-center gap-4 rounded-lg py-2 text-left focus-visible:outline-offset-4"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-lg text-on-surface">{label}</span>
        {description ? (
          <span id={descId} className="text-body-md text-on-surface-variant">
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={
          "relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors duration-200 " +
          (checked ? "border-primary bg-primary" : "border-outline bg-surface-highest")
        }
      >
        <span
          className={
            "switch-thumb absolute top-1/2 grid place-items-center rounded-full " +
            (checked ? "bg-on-primary text-on-primary-container" : "bg-outline")
          }
          data-checked={checked || undefined}
        >
          {checked ? <Check className="anim-pop size-4" strokeWidth={3} /> : null}
        </span>
      </span>
    </button>
  );
}
