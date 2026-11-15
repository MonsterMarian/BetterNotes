import * as React from "react";
import { Check, X } from "lucide-react";
import { cn } from "./cn";

export interface ChipProps {
  selected?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Křížek vpravo (štítek v poznámce). */
  onRemove?: () => void;
  className?: string;
}

/*
 * Filtrovací čip M3. Vybraný se přebarví zvýrazňovačem a roh se zakulatí
 * do pilulky - poznat ho jde i bez barvy, podle tvaru a fajfky.
 */
const shell =
  "press-morph inline-flex h-8 shrink-0 select-none items-center whitespace-nowrap text-label-lg [&_svg]:size-[18px] [&_svg]:shrink-0";

export function Chip({ selected = false, onClick, icon, children, onRemove, className }: ChipProps) {
  const look = selected
    ? "rounded-full bg-primary-container text-on-primary-container"
    : "rounded-sm border border-outline-variant text-on-surface-variant";
  const lead = selected ? <Check className="anim-pop" aria-hidden /> : icon;

  const body = (
    <>
      {lead ? <span className="-ml-0.5 grid">{lead}</span> : null}
      <span>{children}</span>
    </>
  );

  if (!onRemove) {
    return (
      <button
        type="button"
        aria-pressed={onClick ? selected : undefined}
        onClick={onClick}
        className={cn(shell, "state-layer gap-2 px-3", look, className)}
      >
        {body}
      </button>
    );
  }

  // Dvě akce v jednom čipu = dvě tlačítka vedle sebe, ne tlačítko v tlačítku.
  return (
    <span className={cn(shell, "gap-0.5 pr-0.5", look, className)}>
      {onClick ? (
        <button
          type="button"
          aria-pressed={selected}
          onClick={onClick}
          className="state-layer flex h-full items-center gap-2 rounded-[inherit] pl-3 pr-1"
        >
          {body}
        </button>
      ) : (
        <span className="flex items-center gap-2 pl-3 pr-1">{body}</span>
      )}
      <button
        type="button"
        aria-label={`Odebrat ${typeof children === "string" ? children : ""}`.trim()}
        onClick={onRemove}
        className="state-layer grid size-7 place-items-center rounded-full [&_svg]:size-4"
      >
        <X />
      </button>
    </span>
  );
}
