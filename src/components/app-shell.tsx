"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NotebookPen, Settings, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { SettingsDialog } from "@/components/settings-dialog";
import { useTrackNavigation } from "@/components/providers/use-app-back";
import { useStore } from "@/components/providers/store-provider";
import { trashedNotes } from "@/lib/notes";
import {
  hideSplash,
  isNative,
  registerBackButton,
  syncStatusBar,
  useBundledFiles,
} from "@/lib/native";
import { cn } from "@/lib/utils";

/** Statický export přidává lomítko na konec ("/trash/"), porovnává se bez něj. */
function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/** Obrazovky, ze kterých tlačítko Zpět appku zavře - nikam výš už to nejde. */
const ROOTS = ["/", "/trash"];

/**
 * Nativní chování appky: schování splash screenu po prvním vykreslení
 * a hardwarové tlačítko Zpět. V prohlížeči se nespustí nic.
 */
function useNativeShell() {
  const pathname = usePathname();
  const router = useRouter();
  const atRoot = React.useRef(true);
  atRoot.current = ROOTS.includes(normalizePath(pathname));

  React.useEffect(() => {
    // Nejdřív srovnat, odkud se appka servíruje. Když si dřívější verze
    // stáhla balík, Capacitor si tu cestu drží nativně i po přeinstalaci
    // APK - a nová verze by vůbec nenaběhla. Když se to srovnává, appka se
    // překresluje a zbytek by stejně nedoběhl.
    void useBundledFiles().then((reset) => {
      if (reset) return;
      void hideSplash();
      // Stavová lišta musí sednout na téma z localStorage - nasazuje ho skript
      // v layoutu ještě před prvním paintem a nikdo jiný se o ni nestará.
      void syncStatusBar(document.documentElement.classList.contains("dark"));
    });
  }, []);

  React.useEffect(() => {
    let cleanup = () => {};
    void registerBackButton(() => {
      if (atRoot.current) return false;
      router.back();
      return true;
    }).then((fn) => {
      cleanup = fn;
    });
    return () => cleanup();
  }, [router]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, hydrated } = useStore();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [native, setNative] = React.useState(false);

  useNativeShell();
  useTrackNavigation();
  React.useEffect(() => setNative(isNative()), []);

  const inTrash = normalizePath(pathname) === "/trash";
  const trashCount = hydrated ? trashedNotes(state).length : 0;

  return (
    <div className={cn("flex min-h-screen flex-col", native && "select-none")}>
      <header className="mw-safe-top mw-safe-x sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <NotebookPen className="size-5 text-progress" />
            BetterNotes
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/trash/"
              aria-label="Koš"
              title="Koš"
              aria-current={inTrash ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: inTrash ? "secondary" : "ghost", size: "icon" }),
                "relative",
              )}
            >
              <Trash2 />
              {/* Tečka místo čísla: kolik je v koši položek není při procházení
                  poznámek podstatné, jen jestli tam něco je. */}
              {trashCount > 0 ? (
                <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive" />
              ) : null}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Nastavení"
              title="Nastavení"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
            </Button>
          </div>
        </div>
      </header>

      {/* pt-5, ne py-5: spodní odsazení řeší mw-pad-nav a py-5 by ho přebilo. */}
      <main className="mw-pad-nav mx-auto w-full max-w-3xl flex-1 px-4 pt-5">{children}</main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
