/**
 * Most do nativní vrstvy.
 *
 * Appka běží ve dvou prostředích: v prohlížeči při vývoji a jako Android appka
 * přes Capacitor. Všechno tady je proto podmíněné - v prohlížeči se nic
 * nestane a nic nespadne.
 *
 * Pluginy se importují staticky. Dynamický `await import()` si tahá samostatný
 * JS kus a když ho místní server Capacitoru nenajde, vrátí index.html - skript
 * se "načte", ale je to HTML, kus se nezaregistruje a promise se nikdy
 * nevyřeší. Volání pak visí bez jediné stopy.
 */
import { App } from "@capacitor/app";
import { WebView } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function capacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNative(): boolean {
  return capacitor()?.isNativePlatform?.() === true;
}

/** Krátké cvaknutí při zaškrtnutí winu - na mobilu, jinak nic. */
export async function tapFeedback(): Promise<void> {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // zařízení bez vibrace - není co řešit
  }
}

/** Delší cvaknutí, když padne microwin. */
export async function winFeedback(): Promise<void> {
  if (!isNative()) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // zařízení bez vibrace
  }
}

/** Stavová lišta v barvě appky, ikony podle světlosti tématu. */
export async function syncStatusBar(dark: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: dark ? "#09090B" : "#FDFDFD" });
  } catch {
    // starší Android bez podpory barvy lišty
  }
}

/**
 * Srovná appku na obsah z APK.
 *
 * Capacitor si cestu, ze které servíruje soubory, ukládá **nativně**
 * (`persistServerBasePath`), ne v localStorage. Když si appka někdy stáhla
 * balík s aktualizací, drží si tuhle cestu i po přeinstalaci APK - a nová
 * verze se pak vůbec nespustí, protože WebView pořád obsluhuje soubory
 * ze starého balíku. Zvenčí to vypadá, že se instalace neprovedla.
 *
 * Proto se to při startu jednou srovná. Když už appka běží z APK (prázdná
 * cesta), nedělá se nic - jinak by se překreslovala pořád dokola.
 *
 * Data tím netrpí: poznámky patří k adrese `localhost`, kterou tahle změna
 * nemění, a fotky leží v souborech appky.
 */
export async function useBundledFiles(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const active = await WebView.getServerBasePath();
    if (!active.path) return false;

    // Na setServerBasePath se schválně NEČEKÁ: překreslení WebView je ve
    // frontě dřív než doručení odpovědi do JS, takže odpověď nikdy nedorazí
    // a `await` by čekal navždy. Servírování se přepne synchronně, stačí
    // tedy zavolat a překreslit si sám.
    void WebView.setServerBasePath({ path: "" });
    void WebView.persistServerBasePath();
    setTimeout(() => {
      try {
        window.location.reload();
      } catch {
        // nic lepšího už neuděláme
      }
    }, 400);
    return true;
  } catch {
    // Starší most bez těchhle volání - appka běží z APK tak jako tak.
    return false;
  }
}

export async function hideSplash(): Promise<void> {
  if (!isNative()) return;
  try {
    await SplashScreen.hide();
  } catch {
    // splash se skryje sám podle launchShowDuration
  }
}

/**
 * Hardwarové tlačítko Zpět. Uvnitř appky jde o krok zpět v historii,
 * na hlavní obrazovce appku ukončí - tak se chová každá Android appka.
 */
export async function registerBackButton(onBack: () => boolean): Promise<() => void> {
  if (!isNative()) return () => {};
  try {
    const handle = await App.addListener("backButton", () => {
      const handled = onBack();
      if (!handled) void App.exitApp();
    });
    return () => void handle.remove();
  } catch {
    return () => {};
  }
}
