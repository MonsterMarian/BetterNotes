"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "./cn";

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Nápovědy se v prázdném poli střídají po 4 s, první slouží i jako popisek. */
  hints: string[];
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onFocusChange?: (focused: boolean) => void;
  className?: string;
}

const HINT_MS = 4000;

/** Vyhledávací pole M3: pilulka 56 px, nápověda místo statického placeholderu. */
export function SearchBar({
  value,
  onChange,
  hints,
  leading,
  trailing,
  onFocusChange,
  className,
}: SearchBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [focused, setFocused] = React.useState(false);
  const [hint, setHint] = React.useState(0);
  const cycling = !value && !focused && hints.length > 1;

  React.useEffect(() => {
    if (!cycling) return;
    const timer = window.setInterval(() => setHint((i) => (i + 1) % hints.length), HINT_MS);
    return () => window.clearInterval(timer);
  }, [cycling, hints.length]);

  const focusChange = (f: boolean) => {
    setFocused(f);
    onFocusChange?.(f);
  };

  return (
    <div
      className={cn(
        "flex h-14 w-full items-center gap-1 rounded-full bg-surface-high px-1 text-on-surface transition-shadow duration-200 focus-within:shadow-[inset_0_0_0_2px_var(--primary)]",
        className,
      )}
    >
      <span className="grid size-12 shrink-0 place-items-center text-on-surface-variant [&_svg]:size-6">
        {leading ?? <Search aria-hidden />}
      </span>
      <div className="relative min-w-0 flex-1 self-stretch">
        {!value ? (
          <span
            key={hint}
            aria-hidden
            className="hint-in pointer-events-none absolute inset-0 flex items-center truncate text-body-lg text-on-surface-variant"
          >
            {hints[hint % Math.max(1, hints.length)]}
          </span>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label={hints[0]}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => focusChange(true)}
          onBlur={() => focusChange(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && value) {
              e.stopPropagation();
              onChange("");
            }
          }}
          className="relative h-full w-full bg-transparent text-body-lg text-on-surface outline-none focus-visible:outline-none"
        />
      </div>
      {value ? (
        <button
          type="button"
          aria-label="Vymazat hledání"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="state-layer anim-pop grid size-12 shrink-0 place-items-center rounded-full text-on-surface-variant [&_svg]:size-6"
        >
          <X />
        </button>
      ) : null}
      {trailing}
    </div>
  );
}
