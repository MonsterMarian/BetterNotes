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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FDFDFD" },
    { media: "(prefers-color-scheme: dark)", color: "#09090B" },
  ],
  // Nativní appka: obsah až do rohů, žádné zoomování dvojklikem.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/** Nasadí téma před prvním paintem, aby neproblikl světlý podklad. */
const themeScript = `try{var d=document.documentElement;var t=localStorage.getItem("betternotes:theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))d.classList.add("dark")}catch(e){}`;

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
      w.setServerBasePath({path:""});
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
        <meta name="version" content={process.env.NEXT_PUBLIC_BUNDLE_VERSION || "dev"} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: rescueScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <StoreProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
