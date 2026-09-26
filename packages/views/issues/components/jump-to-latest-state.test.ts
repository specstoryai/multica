// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AT_BOTTOM_THRESHOLD_PX,
  computePlacement,
  contentFits,
  EDGE_GAP_PX,
  isAtBottom,
  POINTER_OFFSET_PX,
  shouldReveal,
} from "./jump-to-latest-state";

const viewport = { left: 100, top: 50, width: 800, height: 600 };
const size = { width: 36, height: 36 };

describe("isAtBottom / contentFits / shouldReveal", () => {
  it("treats the last threshold pixels as the bottom", () => {
    expect(isAtBottom({ scrollTop: 0, clientHeight: 600, scrollHeight: 600 })).toBe(true);
    expect(
      isAtBottom({ scrollTop: 1400 - AT_BOTTOM_THRESHOLD_PX, clientHeight: 600, scrollHeight: 2000 }),
    ).toBe(true);
    expect(
      isAtBottom({ scrollTop: 1400 - AT_BOTTOM_THRESHOLD_PX - 1, clientHeight: 600, scrollHeight: 2000 }),
    ).toBe(false);
  });

  it("does not reveal when the content fits or the end is on screen", () => {
    expect(contentFits({ scrollTop: 0, clientHeight: 600, scrollHeight: 600 })).toBe(true);
    expect(shouldReveal({ scrollTop: 0, clientHeight: 600, scrollHeight: 600 })).toBe(false);
    expect(shouldReveal({ scrollTop: 1400, clientHeight: 600, scrollHeight: 2000 })).toBe(false);
  });

  it("reveals when scrolled away from the end", () => {
    expect(shouldReveal({ scrollTop: 0, clientHeight: 600, scrollHeight: 2000 })).toBe(true);
    expect(shouldReveal({ scrollTop: 700, clientHeight: 600, scrollHeight: 2000 })).toBe(true);
  });
});

describe("computePlacement", () => {
  it("follows the pointer, offset down-right, on desktop", () => {
    const p = computePlacement({
      mode: "pointer",
      viewport,
      pointer: { x: 400, y: 300 },
      size,
      reservedBottom: 0,
    });
    expect(p).toEqual({ left: 400 + POINTER_OFFSET_PX, top: 300 + POINTER_OFFSET_PX });
  });

  it("clamps a pointer near the viewport's edges inside it", () => {
    const p = computePlacement({
      mode: "pointer",
      viewport,
      pointer: { x: 100 + 800 - 2, y: 50 + 600 - 2 },
      size,
      reservedBottom: 0,
    });
    expect(p.left).toBe(100 + 800 - size.width - EDGE_GAP_PX);
    expect(p.top).toBe(50 + 600 - size.height - EDGE_GAP_PX);
  });

  it("keeps clear of a pinned composer", () => {
    const p = computePlacement({
      mode: "pointer",
      viewport,
      pointer: { x: 400, y: 50 + 600 },
      size,
      reservedBottom: 120,
    });
    expect(p.top).toBe(50 + 600 - 120 - size.height - EDGE_GAP_PX);
  });

  it("centres above the bottom band when there is no pointer", () => {
    const p = computePlacement({ mode: "pointer", viewport, pointer: null, size, reservedBottom: 0 });
    expect(p.left).toBe(100 + (800 - size.width) / 2);
    expect(p.top).toBe(50 + 600 - size.height - EDGE_GAP_PX);
  });

  it("ignores the pointer in bottom mode", () => {
    const p = computePlacement({
      mode: "bottom",
      viewport,
      pointer: { x: 150, y: 80 },
      size,
      reservedBottom: 0,
    });
    expect(p.left).toBe(100 + (800 - size.width) / 2);
    expect(p.top).toBe(50 + 600 - size.height - EDGE_GAP_PX);
  });
});
