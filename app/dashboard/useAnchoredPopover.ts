import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

type Options = {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  /** Fixed panel width in px. Omit to match the trigger as a minimum. */
  width?: number;
};

/**
 * Shows `panelRef` (an element with `popover="auto"`) in the top layer and
 * anchors it under `triggerRef`, flipping above when there is no room below.
 *
 * Top layer rendering means the panel is not clipped by `overflow` containers
 * and appears above modal dialogs. Platform dismissals (outside click, Escape)
 * are reported through `onClose`, and so are scroll and resize, because the
 * panel is fixed-position and would otherwise detach from its trigger.
 */
export function useAnchoredPopover({
  open,
  onClose,
  triggerRef,
  panelRef,
  width,
}: Options) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!open || !panel || !trigger) return;

    if (!panel.matches(":popover-open")) panel.showPopover();

    const r = trigger.getBoundingClientRect();
    const gap = 4;
    const edge = 8;
    const spaceBelow = window.innerHeight - r.bottom - edge - gap;
    const spaceAbove = r.top - edge - gap;
    const cap = 360;

    if (width) panel.style.width = `${Math.min(width, window.innerWidth - edge * 2)}px`;
    else panel.style.minWidth = `${r.width}px`;
    panel.style.maxWidth = `${window.innerWidth - edge * 2}px`;
    panel.style.maxHeight = `${cap}px`;
    const natural = panel.offsetHeight;
    const above = natural > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.min(cap, Math.max(160, above ? spaceAbove : spaceBelow));
    panel.style.maxHeight = `${maxHeight}px`;

    const height = Math.min(natural, maxHeight);
    const left = Math.max(
      edge,
      Math.min(r.left, window.innerWidth - panel.offsetWidth - edge),
    );
    panel.style.inset = "auto";
    panel.style.margin = "0";
    panel.style.left = `${left}px`;
    panel.style.top = `${above ? r.top - gap - height : r.bottom + gap}px`;
  }, [open, width, panelRef, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "closed") closeRef.current();
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && panel.contains(e.target)) return;
      closeRef.current();
    };
    const onResize = () => closeRef.current();

    panel.addEventListener("toggle", onToggle);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      panel.removeEventListener("toggle", onToggle);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, panelRef]);
}
