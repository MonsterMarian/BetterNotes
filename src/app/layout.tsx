import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { StoreProvider } from "@/components/providers/store-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

export const metadata: Metadata = {
  title: "BetterNotes",
  description: "Poznámky s fotkami, které zůstávají v telefonu.",
};

export const viewport: Viewport = {
  // Jen tmavě, jako ostatní appky. colorScheme brání vynucenému "auto dark" Chromu.
  themeColor: "#000000",
  colorScheme: "dark",
  // Nativní appka: obsah až do rohů, žádné zoomování dvojklikem.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/** Appka je jen tmavá; třída `dark` zůstává kvůli `dark:` variantám a stavové liště. */
const themeScript = `try{document.documentElement.classList.add("dark")}catch(e){}`;

/**
 * Záchranná brzda živých aktualizací.
 *
 * Běží dřív než kód appky a je schválně mimo něj: rozbitá aktualizace by
 * appku nespustila, takže by se neměl kdo vrátit zpět a telefon by zůstal
 * u bílé obrazovky. Značku `booting` maže appka po naběhnutí; když je po deseti
 * vteřinách pořád tam, nasadí se zpátky verze zabalená v APK.
 *
 * Nativní most `window.Capacitor` vstřikuje WebView, ne náš balík, takže je
 * k dispozici i když z appky nenaběhne vůbec nic.
 */
const rescueScript = `try{
if(localStorage.getItem("betternotes:ota:booting")){
  setTimeout(function(){
    try{
      if(window.__bnBooted) return;
      var w=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.WebView;
      if(!w) return;
      localStorage.removeItem("betternotes:ota:booting");
      localStorage.removeItem("betternotes:ota:current");
      localStorage.removeItem("betternotes:ota:pending");
      // Bez .then: setServerBasePath se z principu nedočká odpovědi, protože
      // překreslení WebView je ve frontě dřív. Voláme a překreslíme sami.
      // Zpět na soubory z APK. setServerBasePath({path:""}) by servíroval kořen disku.
      w.setServerAssetPath({path:"public"});
      w.persistServerBasePath();
      setTimeout(function(){ window.location.reload(); }, 400);
    }catch(e){}
  },10000);
}
}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta name="version" content={process.env.NEXT_PUBLIC_BUNDLE_VERSION || "dev"} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: rescueScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <StoreProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
