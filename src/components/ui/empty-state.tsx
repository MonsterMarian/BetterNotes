import * as React from "react";

/**
 * Prázdný stav jako v ostatních appkách (mpL, MicroWins): čárkovaný rámeček,
 * tlumený text a jantarové podtržítko, které bliká jako kurzor - motiv „/_“.
 * `shape` zůstává kvůli volajícím, vzhled už nemění.
 */
export function EmptyState({
  title,
  description,
  actions,
}: {
  shape?: "cookie" | "clover" | "circle";
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="anim-enter mx-auto flex max-w-md flex-col items-center rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
      <p aria-hidden className="font-mono text-headline-md font-semibold text-on-surface">
        /<span className="caret-blink text-primary">_</span>
      </p>
      <h2 className="mt-4 max-w-sm text-balance text-title-lg text-on-surface">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-xs text-pretty text-body-md text-on-surface-variant">{description}</p>
      ) : null}
      {actions ? <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
