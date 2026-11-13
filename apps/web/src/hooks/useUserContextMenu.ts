import { useState, useCallback, useRef } from 'react';
import type { ContextMenuTarget } from '../components/common/UserContextMenu';

export function useUserContextMenu() {
  const [menuState, setMenuState] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    target: ContextMenuTarget | null;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    target: null,
  });

  const timerRef = useRef<any>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const openMenu = useCallback((target: ContextMenuTarget, x: number, y: number) => {
    setMenuState({
      isOpen: true,
      x,
      y,
      target,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Returns touch/click event handlers to bind to any user item/row
  const getTriggerProps = useCallback(
    (target: ContextMenuTarget) => {
      return {
        // Desktop Right Click
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          openMenu(target, e.clientX, e.clientY);
        },

        // Mobile Touch Hold (Long press ~400ms)
        onTouchStart: (e: React.TouchEvent) => {
          const touch = e.touches[0];
          touchStartPos.current = { x: touch.clientX, y: touch.clientY };

          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            if (navigator.vibrate) {
              try {
                navigator.vibrate(40);
              } catch (_) {}
            }
            openMenu(target, touch.clientX, touch.clientY);
          }, 400);
        },

        onTouchEnd: () => {
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        },

        onTouchMove: (e: React.TouchEvent) => {
          if (!touchStartPos.current) return;
          const touch = e.touches[0];
          const dist = Math.hypot(
            touch.clientX - touchStartPos.current.x,
            touch.clientY - touchStartPos.current.y
          );
          // If finger moved more than 8px, it is a scroll -> cancel hold
          if (dist > 8) {
            if (timerRef.current) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
          }
        },
      };
    },
    [openMenu]
  );

  return {
    menuState,
    openMenu,
    closeMenu,
    getTriggerProps,
  };
}

export default useUserContextMenu;
