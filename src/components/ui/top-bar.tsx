"use client";

import * as React from "react";
import { cn } from "./cn";

export interface TopBarProps {
  title?: string;
  /** Drobný jantarový nadpis nad velkým titulkem (značka appky, jako P/_AYER v mpL). */
  eyebrow?: string;
  /** Velký titulek pod řádkem lišty, při odjetí obsahu odroluje pryč. */
  large?: boolean;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  /** Obsah odjel pod lištu - lišta ztmavne o tón (`useScrolled`). */
  scrolled?: boolean;
  /** Pod řádkem (hledání, čipy). U velké lišty zůstává přilepený. */
  children?: React.ReactNode;
  className?: string;
}

/** Výška řádku lišty - na ni se lepí `children` velké lišty. */
const ROW_TOP = "top-[calc(var(--mw-safe-top)+64px)]";

/**
 * Horní lišta M3 bez stínu. Velká lišta vrací tři sourozence (řádek, titulek,
 * přilepený obsah), proto ji stránka vkládá přímo do svého sloupce - jinak by
 * se lepení omezilo na obalující prvek.
 */
export function TopBar({
  title,
  eyebrow,
  large = false,
  leading,
  actions,
  scrolled = false,
  children,
  className,
}: TopBarProps) {
  const surface = cn("bg-surface transition-colors duration-200", scrolled && "bar-scrolled");

  const row = (
    <div className="flex h-16 items-center gap-1 px-1">
      {leading ? <div className="flex shrink-0 items-center">{leading}</div> : <div className="w-3" />}
      {title ? (
        large ? (
          // Malý titulek se objeví, až velký odjede pod lištu.
          <span
            aria-hidden
            className={cn(
              "min-w-0 flex-1 truncate text-title-lg text-on-surface transition-opacity duration-200",
              scrolled ? "opacity-100" : "opacity-0",
            )}
          >
            {title}
          </span>
        ) : (
          <h1 className="min-w-0 flex-1 truncate text-title-lg text-on-surface">{title}</h1>
        )
      ) : (
        <div className="flex-1" />
      )}
      {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
    </div>
  );

  if (!large) {
    return (
      <header className={cn("mw-safe-top mw-safe-x sticky top-0 z-20", surface, className)}>
        {row}
        {children}
      </header>
    );
  }

  return (
    <>
      <header className={cn("mw-safe-top mw-safe-x sticky top-0 z-20", surface, className)}>{row}</header>
      {/* mw-safe-x: na šířku je vlevo systémová lišta a titulek by zajel pod ni. */}
      {eyebrow || title ? (
        <div className="mw-safe-x">
          {eyebrow ? (
            <p className="px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
          ) : null}
          {title ? (
            <h1 className="truncate px-4 pb-3 pt-1 text-headline-lg text-on-surface emph">{title}</h1>
          ) : null}
        </div>
      ) : null}
      {children ? (
        <div className={cn("mw-safe-x sticky z-20", ROW_TOP, surface)}>{children}</div>
      ) : null}
    </>
  );
}

/** True, jakmile okno odjede o víc než `threshold` px. Pasivní posluchač. */
export function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return scrolled;
}
