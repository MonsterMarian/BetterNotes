"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import { imageSrc, readImage } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * Adresa fotky pro `<img src>`.
 *
 * V telefonu je to `convertFileSrc` URL - WebView si soubor načte sám a přes
 * most nejede base64. Když ta adresa selže (`onError`), sáhne se jednou po
 * starém čtení bajtů; teprve když chybí i ty, je fotka opravdu pryč.
 */
export function useImageSrc(name: string): { src: string | null; missing: boolean; onError: () => void } {
  const [src, setSrc] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState(false);
  const current = React.useRef(name);
  const fellBack = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    current.current = name;
    fellBack.current = false;
    setSrc(null);
    setMissing(false);
    void imageSrc(name).then((url) => {
      if (cancelled) return;
      if (url) setSrc(url);
      else setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  const onError = React.useCallback(() => {
    if (fellBack.current) return setMissing(true);
    fellBack.current = true;
    void readImage(name).then((data) => {
      // Mezitím se mohla ukázat jiná fotka (listování v lupě).
      if (current.current !== name) return;
      if (data) setSrc(data);
      else setMissing(true);
    });
  }, [name]);

  return { src, missing, onError };
}

/**
 * Fotka z úložiště. Stav appky drží jen jméno souboru - obrázky v base64
 * uvnitř stavu by localStorage přeplnily po pár fotkách.
 *
 * Načtení je asynchronní, takže se nejdřív ukáže tichý obdélník. Bez něj by
 * seznam po každém otevření poskočil, jak by se karty rozrůstaly.
 */
export function NoteThumb({
  name,
  className,
  alt = "Fotka v poznámce",
}: {
  name: string;
  className?: string;
  alt?: string;
}) {
  const { src, missing, onError } = useImageSrc(name);

  if (missing) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md bg-surface-high text-on-surface-variant",
          className,
        )}
        title="Fotka v telefonu chybí"
      >
        <ImageOff className="size-4" />
      </div>
    );
  }

  if (!src) return <div className={cn("animate-pulse rounded-md bg-surface-high", className)} />;

  // Statický export bez optimalizace obrázků - <img> je tu na místě.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={onError} className={cn("rounded-md object-cover", className)} />;
}
