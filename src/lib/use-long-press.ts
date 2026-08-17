import * as React from "react";

export interface LongPressOptions {
  onLongPress: () => void;
  onClick?: (e: React.MouseEvent) => void;
  ms?: number;
}

/**
 * Hook pro detekci dlouhého stisknutí a případně krátkého kliknutí.
 */
export function useLongPress({ onLongPress, onClick, ms = 400 }: LongPressOptions) {
  const timerId = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = React.useRef(false);
  const startPos = React.useRef<{ x: number; y: number } | null>(null);

  const clear = React.useCallback(() => {
    if (timerId.current) {
      clearTimeout(timerId.current);
      timerId.current = null;
    }
  }, []);

  const start = React.useCallback(
    (e: React.PointerEvent) => {
      // Ignorovat pravé kliknutí myši
      if (e.pointerType === "mouse" && e.button !== 0) return;
      
      startPos.current = { x: e.clientX, y: e.clientY };
      isLongPress.current = false;
      clear();
      
      timerId.current = setTimeout(() => {
        isLongPress.current = true;
        onLongPress();
      }, ms);
    },
    [onLongPress, ms, clear]
  );

  const handlePointerUp = React.useCallback(
    (e: React.PointerEvent) => {
      clear();
    },
    [clear]
  );

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!startPos.current) return;
      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);
      // Pokud se prst posunul příliš (scrollování), zrušíme timer
      if (dx > 10 || dy > 10) {
        clear();
      }
    },
    [clear]
  );

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      if (isLongPress.current) {
        // Zabráníme spuštění standardní akce (např. přechod přes odkaz),
        // protože se jednalo o long press.
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (onClick) {
        onClick(e);
      }
    },
    [onClick]
  );

  // Zamezíme zobrazení kontextového menu po podržení na mobilech
  const handleContextMenu = React.useCallback(
    (e: React.MouseEvent) => {
      if (isLongPress.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    []
  );

  return {
    onPointerDown: start,
    onPointerUp: handlePointerUp,
    onPointerMove: handlePointerMove,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: handleClick,
    onContextMenu: handleContextMenu,
  };
}
