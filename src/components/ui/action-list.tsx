import * as React from "react";
import { Check } from "lucide-react";

export interface ActionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  /** Vybraná volba (řazení, motiv) - zaškrtnutí vpravo. */
  checked?: boolean;
  /** Tichý údaj vpravo, typicky počet ("12"). */
  hint?: string;
  disabled?: boolean;
}

/**
 * Seznam akcí v listu zdola. Řádky 56 px, celé klikací, sahají až k okrajům
 * listu (záporný okraj vyrovná jeho odsazení).
 */
export function ActionList({ items }: { items: ActionItem[] }) {
  return (
    <div role="menu" className="-mx-4 flex flex-col">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role={item.checked === undefined ? "menuitem" : "menuitemradio"}
          aria-checked={item.checked}
          disabled={item.disabled}
          onClick={item.onSelect}
          className={
            "state-layer flex min-h-14 w-full items-center gap-4 rounded-lg-plus px-4 text-left text-body-lg disabled:opacity-40 [&_svg]:size-6 [&_svg]:shrink-0 " +
            (item.destructive ? "text-error" : "text-on-surface")
          }
        >
          {item.icon ? (
            <span className={item.destructive ? "text-error" : "text-on-surface-variant"} aria-hidden>
              {item.icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.hint ? (
            <span className="tabular text-label-lg text-on-surface-variant">{item.hint}</span>
          ) : null}
          {item.checked ? <Check className="anim-pop text-primary" aria-hidden /> : null}
        </button>
      ))}
    </div>
  );
}
