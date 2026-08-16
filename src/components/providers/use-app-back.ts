"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Šipka zpět v detailech.
 *
 * Nevrací se v historii, ale **o úroveň výš ve stromu**: z podúkolu na úkol,
 * z úkolu na projekt, z projektu na seznam. Stejně se chová strom microwinů
 * a je to jediné chování, které jde předvídat - `router.back()` po delším
 * proklikávání vracel tam, odkud člověk přišel, což u třetího kliknutí
 * znamenalo skok do úplně jiné části appky.
 *
 * Historii přesto počítáme: když appka naběhla rovnou na detailu (odkaz
 * zvenčí, obnovený tab, studený start nativní appky), nemá `push` na co
 * navázat a je čistší cíl nahradit, aby v zásobníku nezůstala prázdná stopa.
 */
let inAppNavigations = 0;

/** Volá se jednou v `AppShell` - jinde by se přechody počítaly víckrát. */
export function useTrackNavigation(): void {
  const pathname = usePathname();
  const first = React.useRef(true);

  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    inAppNavigations += 1;
  }, [pathname]);
}

/**
 * Vrstvy, které tlačítko Zpět zavře dřív, než se někam naviguje.
 *
 * Fotka přes celou obrazovku není obrazovka v routeru - kdyby Zpět rovnou
 * navigovalo, zavřelo by z lupy celý detail poznámky. Zásobník proto drží
 * poslední otevřenou vrstvu a ta si Zpět vezme pro sebe.
 */
const backLayers: { close: () => void }[] = [];

/** Vrátí true, když si Zpět vzala některá vrstva a navigovat se nemá. */
export function closeTopBackLayer(): boolean {
  const top = backLayers[backLayers.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/** Přihlásí otevřenou vrstvu (lupa, budoucí přehrávač) k tlačítku Zpět. */
export function useBackLayer(open: boolean, close: () => void): void {
  const latest = React.useRef(close);
  latest.current = close;

  React.useEffect(() => {
    if (!open) return;
    const layer = { close: () => latest.current() };
    backLayers.push(layer);
    return () => {
      const at = backLayers.indexOf(layer);
      if (at !== -1) backLayers.splice(at, 1);
    };
  }, [open]);
}

/** Vrátí funkci „jdi na tuhle nadřazenou obrazovku". */
export function useGoUp(): (href: string) => void {
  const router = useRouter();
  return React.useCallback(
    (href: string) => {
      if (inAppNavigations > 0) router.push(href);
      else router.replace(href);
    },
    [router],
  );
}
