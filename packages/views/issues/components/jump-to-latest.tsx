"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { useIsMobile } from "@multica/ui/hooks/use-mobile";
import { cn } from "@multica/ui/lib/utils";
import { useT } from "../../i18n";
import {
  computePlacement,
  HIDE_AFTER_IDLE_MS,
  resolveJumpTarget,
  type JumpTarget,
  type PlacementMode,
} from "./jump-to-latest-state";

interface JumpToLatestButtonProps {
  /** The issue detail scroll viewport. Null until it mounts. */
  container: HTMLElement | null;
  /** The comment composer; its height is kept clear when it is pinned. */
  composerRef: React.RefObject<HTMLElement | null>;
  /** Whether the composer is pinned to the viewport's bottom edge. */
  stickyComposer: boolean;
  /** Extra classes for the positioned wrapper. */
  className?: string;
  /**
   * Performs the jump. When omitted the control scrolls `container` itself
   * (`scrollContainerToEnd` / `scrollContainerToTop`); the issue view passes
   * a Virtuoso-aware jump.
   */
  onJump?: (target: JumpTarget) => void;
}

/** Frames the settle loop keeps correcting before it gives up. */
export const SETTLE_MAX_FRAMES = 90;
/** Consecutive frames the end must stay put before the settle loop stops. */
const SETTLE_STABLE_FRAMES = 3;

/**
 * Scroll a container to its end and keep it there while the end moves.
 *
 * A virtualized timeline grows as it scrolls: rows below the viewport render
 * at their estimated height and are re-measured on the way down, so a single
 * `scrollTo(scrollHeight)` aims at a height that is already stale by the time
 * it lands, stranding the reader short of the newest comment. This re-targets
 * the end every animation frame until the height has stopped changing for a
 * few frames or the frame budget runs out. Returns a cancel function.
 */
export function settleScrollAtEnd(container: HTMLElement): () => void {
  let raf = 0;
  let frames = 0;
  let stable = 0;
  let lastHeight = -1;
  const step = () => {
    const end = Math.max(0, container.scrollHeight - container.clientHeight);
    const atEnd = Math.abs(container.scrollTop - end) <= 1;
    if (!atEnd) container.scrollTop = end;
    if (container.scrollHeight === lastHeight && atEnd) stable += 1;
    else stable = 0;
    lastHeight = container.scrollHeight;
    if (stable >= SETTLE_STABLE_FRAMES || ++frames >= SETTLE_MAX_FRAMES) return;
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

function prefersReducedMotion(): boolean {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Default jump: one scroll to the end, smooth unless motion is reduced, then
 * the settle loop so a growing end is still reached.
 */
export function scrollContainerToEnd(container: HTMLElement): () => void {
  container.scrollTo({ top: container.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  return settleScrollAtEnd(container);
}

/** Default jump to the top. The top does not move, so no settling is needed. */
export function scrollContainerToTop(container: HTMLElement): void {
  container.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/**
 * Floating "jump to latest" control for the issue timeline.
 *
 * Hidden at rest. Scrolling reveals it, pointing the way the reader is
 * heading: down offers the newest comment, up offers the top, and nothing is
 * offered once that end is already on screen. It fades out once scrolling has
 * been idle for a moment, so it never sits over the content. With a mouse it
 * appears just below-right of the cursor, where the hand already is; on a
 * narrow viewport or a coarse pointer it appears centred near the bottom.
 * Hover or focus holds it visible.
 *
 * Positioned absolutely inside the content column (the same parent as the
 * find bar) rather than inside the scroller, so it does not move with the
 * content and its own text is not walked by find-in-issue.
 */
export function JumpToLatestButton({
  container,
  composerRef,
  stickyComposer,
  className,
  onJump,
}: JumpToLatestButtonProps) {
  const { t } = useT("issues");
  const isMobile = useIsMobile();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [target, setTarget] = useState<JumpTarget>("latest");
  const lastScrollTopRef = useRef<number | null>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);

  const mode: PlacementMode = isMobile || hasCoarsePointer() ? "bottom" : "pointer";

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const armIdleTimer = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      if (!holdRef.current) setVisible(false);
    }, HIDE_AFTER_IDLE_MS);
  }, [clearIdleTimer]);

  const place = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;
    const parent = wrapper.offsetParent as HTMLElement | null;
    const origin = parent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const c = container.getBoundingClientRect();
    const reservedBottom = stickyComposer
      ? composerRef.current?.getBoundingClientRect().height ?? 0
      : 0;
    const size = {
      width: wrapper.offsetWidth || 36,
      height: wrapper.offsetHeight || 36,
    };
    const pointer = pointerRef.current
      ? { x: pointerRef.current.x - origin.left, y: pointerRef.current.y - origin.top }
      : null;
    setPlacement(
      computePlacement({
        mode,
        viewport: {
          left: c.left - origin.left,
          top: c.top - origin.top,
          width: c.width,
          height: c.height,
        },
        pointer,
        size,
        reservedBottom,
      }),
    );
  }, [container, composerRef, mode, stickyComposer]);

  // Scroll reveals; idle hides; reaching the end hides at once. The position
  // at attach time seeds the direction so the very first scroll already reads.
  useEffect(() => {
    if (!container) return;
    lastScrollTopRef.current = container.scrollTop;
    const onScroll = () => {
      const previous = lastScrollTopRef.current ?? container.scrollTop;
      lastScrollTopRef.current = container.scrollTop;
      const next = resolveJumpTarget(previous, container);
      if (!next) {
        clearIdleTimer();
        setVisible(false);
        return;
      }
      setTarget(next);
      setVisible(true);
      place();
      armIdleTimer();
    };
    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    container.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      container.removeEventListener("pointermove", onPointerMove);
      clearIdleTimer();
    };
  }, [container, place, armIdleTimer, clearIdleTimer]);

  // Measure once the control has a layout, so the first reveal is placed with
  // its real size rather than the fallback.
  useLayoutEffect(() => {
    if (visible) place();
  }, [visible, place]);

  const cancelSettleRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelSettleRef.current?.(), []);

  const jump = useCallback(() => {
    if (!container) return;
    cancelSettleRef.current?.();
    if (onJump) {
      onJump(target);
    } else if (target === "top") {
      scrollContainerToTop(container);
    } else {
      cancelSettleRef.current = scrollContainerToEnd(container);
    }
    clearIdleTimer();
    setVisible(false);
  }, [container, onJump, target, clearIdleTimer]);

  const hold = useCallback(() => {
    holdRef.current = true;
    clearIdleTimer();
  }, [clearIdleTimer]);

  const release = useCallback(() => {
    holdRef.current = false;
    if (visible) armIdleTimer();
  }, [visible, armIdleTimer]);

  const label = target === "top" ? t(($) => $.detail.jump_to_top) : t(($) => $.detail.jump_to_latest);

  return (
    <div
      ref={wrapperRef}
      data-testid="jump-to-latest"
      data-state={visible ? "visible" : "hidden"}
      data-placement={mode}
      data-target={target}
      aria-hidden={!visible}
      className={cn(
        "absolute z-30 transition-opacity duration-200 motion-reduce:transition-none",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
        className,
      )}
      style={placement ? { left: placement.left, top: placement.top } : { left: -9999, top: -9999 }}
      onPointerEnter={hold}
      onPointerLeave={release}
      onFocus={hold}
      onBlur={release}
    >
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        aria-label={label}
        title={label}
        tabIndex={visible ? 0 : -1}
        className="rounded-full shadow-md"
        onClick={jump}
      >
        {target === "top" ? <ArrowUp /> : <ArrowDown />}
      </Button>
    </div>
  );
}

function hasCoarsePointer(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
}
