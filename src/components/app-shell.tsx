"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { closeTopBackLayer, hasInAppHistory, useTrackNavigation } from "@/components/providers/use-app-back";
import { useStore } from "@/components/providers/store-provider";
import { useToast } from "@/components/providers/toast-provider";
import { applyPendingUpdate, checkForUpdate, markBootSucceeded } from "@/lib/live-update";
import { hideSplash, isNative, registerBackButton, syncStatusBar } from "@/lib/native";
import { cn } from "@/lib/utils";

/** Statický export přidává lomítko na konec ("/trash/"), porovnává se bez něj. */
function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/**
 * Obrazovky, ze kterých tlačítko Zpět appku zavře - nikam výš už to nejde.
 * Koš ani archiv sem nepatří: Zpět z nich vede na seznam, ne ven z appky.
 */
const ROOTS = ["/"];

/**
 * Nativní chování appky: schování splash screenu po prvním vykreslení,
 * živé aktualizace a hardwarové tlačítko Zpět. V prohlížeči se nespustí nic.
 */
function useNativeShell() {
  const pathname = usePathname();
  const router = useRouter();
  const atRoot = React.useRef(true);
  atRoot.current = ROOTS.includes(normalizePath(pathname));

  React.useEffect(() => {
    void hideSplash();
    // Stavová lišta musí sednout na téma z localStorage - nasazuje ho skript
    // v layoutu ještě před prvním paintem a nikdo jiný se o ni nestará.
    void syncStatusBar(document.documentElement.classList.contains("dark"));
    // Doběhli jsme sem, takže tenhle balík umí naběhnout - značka o rozjetém
    // startu může pryč, jinak by ho příští spuštění vrátilo zpět.
    markBootSucceeded();
    // Nejdřív nasadit balík stažený minule, teprve pak koukat po novém.
    // Když se nasadilo, WebView se překresluje a kontrola nemá smysl.
    void applyPendingUpdate().then((res) => {
      if (res.applied) return;
      // Chyba se schválně nezahazuje. Nasazení, které tiše selže, je horší
      // než žádné: appka běží dál ze staré verze a tváří se, že je aktuální.
      if (res.error) console.error("Nasazení aktualizace selhalo:", res.error);
      void checkForUpdate();
    });
  }, []);

  React.useEffect(() => {
    let cleanup = () => {};
    void registerBackButton(() => {
      // Otevřená lupa nad detailem se zavře dřív, než se začne navigovat.
      if (closeTopBackLayer()) return true;
      // "/?tag=…" (klepnutí na štítek v poznámce) je seznam, ale ne kořen: Zpět
      // vede zpátky do poznámky, ne ven z appky.
      if (atRoot.current && !window.location.search) return false;
      // Studený start nebo reload přímo na podstránce: historie, kam se vrátit, není.
      if (hasInAppHistory()) router.back();
      else router.replace("/");
      return true;
    }).then((fn) => {
      cleanup = fn;
    });
    return () => cleanup();
  }, [router]);
}

/**
 * Hlášky o datech, které patří na jakoukoli obrazovku: selhané ukládání
 * (typicky plný telefon) a obnova poznámek ze záložní kopie v souborech.
 */
function useDataToasts() {
  const { saveFailed, restoredFromMirror } = useStore();
  // Přes ref: hláška se má ukázat při změně stavu, ne při nové identitě `toast`.
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  toastRef.current = toast;
  const mirrorShown = React.useRef(false);

  React.useEffect(() => {
    if (!saveFailed) return;
    toastRef.current({
      tone: "warn",
      title: "Poznámky se nedaří uložit.",
      description: "Telefon je možná plný. Zálohuj si je a uvolni místo.",
    });
  }, [saveFailed]);

  React.useEffect(() => {
    if (!restoredFromMirror || mirrorShown.current) return;
    mirrorShown.current = true;
    toastRef.current({ tone: "info", title: "Poznámky obnoveny ze záložní kopie" });
  }, [restoredFromMirror]);
}

/**
 * Rám appky bez vlastní lišty - každá obrazovka si nese svou horní lištu
 * i odsazení, protože se liší (velký nadpis na seznamu, průhledná v detailu).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [native, setNative] = React.useState(false);

  useNativeShell();
  useTrackNavigation();
  useDataToasts();
  React.useEffect(() => setNative(isNative()), []);

  return (
    <div className={cn("flex min-h-screen flex-col", native && "select-none")}>
      <main className="w-full flex-1">{children}</main>
    </div>
  );
}
