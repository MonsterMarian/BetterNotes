"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { haptic } from "@/lib/native";

/** Segmentová tlačítka M3 - jedna volba z pár (motiv, písmo, zobrazení). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: { id: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
  "aria-label": string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex h-12 w-full overflow-hidden rounded-full border border-outline"
    >
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (selected) return;
              haptic("select");
              onChange(o.id);
            }}
            className={
              "state-layer flex min-w-0 flex-auto items-center justify-center gap-2 border-l border-outline px-3 text-label-lg transition-colors duration-200 first:border-l-0 focus-visible:-outline-offset-2 [&_svg]:size-[18px] [&_svg]:shrink-0 " +
              (selected ? "bg-primary-container text-on-primary-container" : "text-on-surface")
            }
          >
            {selected ? <Check className="anim-pop" aria-hidden /> : o.icon}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
