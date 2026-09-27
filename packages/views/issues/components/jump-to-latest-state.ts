/**
 * Pure helpers behind the issue timeline's jump-to-latest control. Kept free
 * of React and the DOM so the visibility and placement rules have one
 * canonical unit-test layer; the component only wires events to them.
 */

/** How close to the end still counts as "at the bottom", in CSS pixels. */
export const AT_BOTTOM_THRESHOLD_PX = 24;

/** Idle time after the last scroll event before the control fades away. */
export const HIDE_AFTER_IDLE_MS = 1200;

/** Distance from the pointer to the control's top-left corner (desktop). */
export const POINTER_OFFSET_PX = 20;

/** Gap kept from the scroll viewport's edges and from the composer. */
export const EDGE_GAP_PX = 12;

export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/** True when the viewport shows the end of the content (within the threshold). */
export function isAtBottom(m: ScrollMetrics, threshold = AT_BOTTOM_THRESHOLD_PX): boolean {
  return m.scrollHeight - (m.scrollTop + m.clientHeight) <= threshold;
}

/** True when the viewport shows the start of the content (within the threshold). */
export function isAtTop(m: ScrollMetrics, threshold = AT_BOTTOM_THRESHOLD_PX): boolean {
  return m.scrollTop <= threshold;
}

/** True when there is nothing to scroll to: the content fits the viewport. */
export function contentFits(m: ScrollMetrics): boolean {
  return m.scrollHeight <= m.clientHeight + 1;
}

/**
 * Whether a scroll event should reveal the control. Nothing to reveal when the
 * end is already on screen or the content has no overflow.
 */
export function shouldReveal(m: ScrollMetrics): boolean {
  return !contentFits(m) && !isAtBottom(m);
}

/** Which way the control jumps: to the newest comment or back to the top. */
export type JumpTarget = "latest" | "top";

/** Scroll movements smaller than this are jitter, not a direction. */
export const DIRECTION_MIN_DELTA_PX = 2;

/**
 * The jump a scroll event should offer, from the direction of travel: heading
 * down offers the newest comment, heading up offers the top. Null when there is
 * nothing to offer: no overflow, a movement too small to read as a direction,
 * or already at the end the direction points to.
 */
export function resolveJumpTarget(previousScrollTop: number, m: ScrollMetrics): JumpTarget | null {
  if (contentFits(m)) return null;
  const delta = m.scrollTop - previousScrollTop;
  if (Math.abs(delta) < DIRECTION_MIN_DELTA_PX) return null;
  if (delta > 0) return isAtBottom(m) ? null : "latest";
  return isAtTop(m) ? null : "top";
}

export type PlacementMode = "pointer" | "bottom";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlacementInput {
  mode: PlacementMode;
  /** Scroll viewport, in the coordinate space the control is positioned in. */
  viewport: Rect;
  /** Last known pointer position in the same coordinate space, if any. */
  pointer: { x: number; y: number } | null;
  /** Rendered size of the control. */
  size: { width: number; height: number };
  /** Height of a composer pinned to the viewport's bottom edge, else 0. */
  reservedBottom: number;
}

export interface Placement {
  left: number;
  top: number;
}

/**
 * Where the control sits. Desktop follows the pointer, offset down-right so it
 * never lands under the cursor; without a pointer position (keyboard
 * scrolling, touch) it centres above the composer. Every result is clamped to
 * stay inside the viewport and clear of the reserved bottom band.
 */
export function computePlacement(input: PlacementInput): Placement {
  const { viewport, size, reservedBottom } = input;
  const minLeft = viewport.left + EDGE_GAP_PX;
  const maxLeft = viewport.left + viewport.width - size.width - EDGE_GAP_PX;
  const minTop = viewport.top + EDGE_GAP_PX;
  const maxTop = viewport.top + viewport.height - reservedBottom - size.height - EDGE_GAP_PX;

  let left: number;
  let top: number;
  if (input.mode === "pointer" && input.pointer) {
    left = input.pointer.x + POINTER_OFFSET_PX;
    top = input.pointer.y + POINTER_OFFSET_PX;
  } else {
    left = viewport.left + (viewport.width - size.width) / 2;
    top = maxTop;
  }
  return {
    left: clamp(left, minLeft, Math.max(minLeft, maxLeft)),
    top: clamp(top, minTop, Math.max(minTop, maxTop)),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
