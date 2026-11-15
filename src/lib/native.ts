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
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { getPrefs } from "./prefs";

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

export type HapticKind = "tick" | "select" | "press" | "success" | "error";

/**
 * Hmatová odezva. Vystřelí a zapomene - na vibraci se nikdy nečeká a její
 * selhání (zařízení bez motorku) nemá co rozbít. Vypíná se v Nastavení.
 */
export function haptic(kind: HapticKind): void {
  if (!isNative() || !getPrefs().haptics) return;
  const run = async () => {
    if (kind === "tick") return Haptics.impact({ style: ImpactStyle.Light });
    if (kind === "press") return Haptics.impact({ style: ImpactStyle.Medium });
    if (kind === "select") {
      // Android selectionChanged bez selectionStart tiše nic neudělá.
      await Haptics.selectionStart();
      await Haptics.selectionChanged();
      return Haptics.selectionEnd();
    }
    return Haptics.notification({
      type: kind === "success" ? NotificationType.Success : NotificationType.Error,
    });
  };
  run().catch(() => {
    // zařízení bez vibrace - není co řešit
  });
}

/** Starší jméno pro `haptic("tick")`. */
export async function tapFeedback(): Promise<void> {
  haptic("tick");
}

/** Starší jméno pro `haptic("success")`. */
export async function winFeedback(): Promise<void> {
  haptic("success");
}

/** Stavová lišta v barvě appky, ikony podle světlosti tématu. */
export async function syncStatusBar(dark: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: dark ? "#000000" : "#FFFFFF" });
  } catch {
    // starší Android bez podpory barvy lišty
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
