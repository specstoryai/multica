import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createRef } from "react";
import { renderWithI18n } from "../../test/i18n";
import { JumpToLatestButton, SETTLE_MAX_FRAMES, settleScrollAtEnd, settleScrollAtTop, SMOOTH_MAX_VIEWPORTS } from "./jump-to-latest";
import { HIDE_AFTER_IDLE_MS } from "./jump-to-latest-state";

// Component wiring for the timeline's jump-to-latest control: hidden at rest,
// revealed by a scroll that leaves the end off screen, faded after idle, and a
// click scrolls the container to its end. Geometry rules live in
// jump-to-latest-state.test.ts; here the container is a plain div with the
// scroll metrics stubbed.

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

function makeContainer(metrics: { scrollTop: number; clientHeight: number; scrollHeight: number }) {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientHeight", { configurable: true, value: metrics.clientHeight });
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: metrics.scrollHeight });
  el.scrollTop = 0;
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => metrics.scrollTop,
    set: (v: number) => {
      metrics.scrollTop = v;
    },
  });
  el.scrollTo = vi.fn() as unknown as typeof el.scrollTo;
  document.body.appendChild(el);
  return el;
}

/** Move the container to `top` and fire the scroll event, like a real scroll. */
function scrollTo(container: HTMLElement, top: number) {
  container.scrollTop = top;
  act(() => {
    fireEvent.scroll(container);
  });
}

function renderButton(container: HTMLElement | null, sticky = false) {
  const composerRef = createRef<HTMLElement>();
  return renderWithI18n(
    <JumpToLatestButton container={container} composerRef={composerRef} stickyComposer={sticky} />,
  );
}

describe("JumpToLatestButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setViewportWidth(1280);
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("is hidden at rest and not focusable", () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 600, scrollHeight: 2000 });
    renderButton(container);
    const wrapper = screen.getByTestId("jump-to-latest");
    expect(wrapper).toHaveAttribute("data-state", "hidden");
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { hidden: true })).toHaveAttribute("tabindex", "-1");
  });

  it("appears on scroll away from the end and fades after idle", () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 600, scrollHeight: 2000 });
    renderButton(container);
    scrollTo(container, 300);
    const wrapper = screen.getByTestId("jump-to-latest");
    expect(wrapper).toHaveAttribute("data-state", "visible");
    expect(wrapper).toHaveAttribute("data-target", "latest");
    expect(screen.getByRole("button", { name: "Jump to latest" })).toHaveAttribute("tabindex", "0");

    act(() => {
      vi.advanceTimersByTime(HIDE_AFTER_IDLE_MS - 1);
    });
    expect(wrapper).toHaveAttribute("data-state", "visible");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(wrapper).toHaveAttribute("data-state", "hidden");
  });

  it("stays hidden when the end of the timeline is already on screen", () => {
    const metrics = { scrollTop: 1300, clientHeight: 600, scrollHeight: 2000 };
    const container = makeContainer(metrics);
    renderButton(container);
    scrollTo(container, 1400);
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-state", "hidden");
  });

  it("offers the top when scrolling up, and nothing once the top is on screen", () => {
    const metrics = { scrollTop: 1000, clientHeight: 600, scrollHeight: 2000 };
    const container = makeContainer(metrics);
    renderButton(container);
    scrollTo(container, 700);
    const wrapper = screen.getByTestId("jump-to-latest");
    expect(wrapper).toHaveAttribute("data-state", "visible");
    expect(wrapper).toHaveAttribute("data-target", "top");
    fireEvent.click(screen.getByRole("button", { name: "Jump to top" }));
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(wrapper).toHaveAttribute("data-state", "hidden");
    scrollTo(container, 10);
    scrollTo(container, 0);
    expect(wrapper).toHaveAttribute("data-state", "hidden");
  });

  it("switches target with the direction of travel", () => {
    const metrics = { scrollTop: 500, clientHeight: 600, scrollHeight: 2000 };
    const container = makeContainer(metrics);
    renderButton(container);
    scrollTo(container, 800);
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-target", "latest");
    scrollTo(container, 600);
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-target", "top");
    expect(screen.getByRole("button", { name: "Jump to top" })).toBeInTheDocument();
  });

  it("hides as soon as a scroll reaches the end", () => {
    const metrics = { scrollTop: 0, clientHeight: 600, scrollHeight: 2000 };
    const container = makeContainer(metrics);
    renderButton(container);
    scrollTo(container, 300);
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-state", "visible");
    scrollTo(container, 1400);
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-state", "hidden");
  });

  it("holds while hovered, then fades after leaving", () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 600, scrollHeight: 2000 });
    renderButton(container);
    scrollTo(container, 300);
    const wrapper = screen.getByTestId("jump-to-latest");
    fireEvent.pointerEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(HIDE_AFTER_IDLE_MS * 3);
    });
    expect(wrapper).toHaveAttribute("data-state", "visible");
    fireEvent.pointerLeave(wrapper);
    act(() => {
      vi.advanceTimersByTime(HIDE_AFTER_IDLE_MS);
    });
    expect(wrapper).toHaveAttribute("data-state", "hidden");
  });

  it("scrolls the container to its end on click and hides", () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 600, scrollHeight: 2000 });
    renderButton(container);
    scrollTo(container, 300);
    fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: "smooth" });
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-state", "hidden");
  });

  it("uses an instant scroll under reduced motion", () => {
    window.matchMedia = vi.fn((q: string) => ({
      matches: q.includes("prefers-reduced-motion"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const container = makeContainer({ scrollTop: 0, clientHeight: 600, scrollHeight: 2000 });
    renderButton(container);
    scrollTo(container, 300);
    fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: "auto" });
  });

  it("follows the pointer on desktop and centres near the bottom on a phone", () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 600, scrollHeight: 2000 });
    const { unmount } = renderButton(container);
    fireEvent.pointerMove(container, { clientX: 300, clientY: 200 });
    scrollTo(container, 300);
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-placement", "pointer");
    unmount();

    setViewportWidth(390);
    renderButton(container);
    scrollTo(container, 300);
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-placement", "bottom");
  });
  it("calls onJump instead of scrolling itself when provided", () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 600, scrollHeight: 2000 });
    const onJump = vi.fn();
    const composerRef = createRef<HTMLElement>();
    renderWithI18n(
      <JumpToLatestButton container={container} composerRef={composerRef} stickyComposer={false} onJump={onJump} />,
    );
    scrollTo(container, 300);
    fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
    expect(onJump).toHaveBeenCalledWith("latest");
    expect(container.scrollTo).not.toHaveBeenCalled();
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-state", "hidden");
  });
});

describe("settleScrollAtEnd", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  // Regression for Runstory finding f-f17b2c0c70c5: a virtualized timeline
  // grows as it scrolls, so one jump to the pre-click scrollHeight lands
  // short. The loop must chase the moving end until it stops moving.
  it("keeps scrolling while the content grows and stops at the final end", () => {
    const metrics = { scrollTop: 300, clientHeight: 800, scrollHeight: 4796 };
    const container = makeContainer(metrics);
    // Each time the viewport reaches the current end, more rows are measured
    // and the height grows, until the true height of 5930 is reached.
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      get: () => metrics.scrollTop,
      set: (v: number) => {
        metrics.scrollTop = v;
        if (metrics.scrollTop >= metrics.scrollHeight - metrics.clientHeight - 1) {
          metrics.scrollHeight = Math.min(5930, metrics.scrollHeight + 400);
        }
      },
    });
    Object.defineProperty(container, "scrollHeight", {
      configurable: true,
      get: () => metrics.scrollHeight,
    });
    const cancel = settleScrollAtEnd(container);
    act(() => {
      vi.advanceTimersByTime(16 * SETTLE_MAX_FRAMES);
    });
    expect(metrics.scrollHeight).toBe(5930);
    expect(metrics.scrollTop).toBe(5930 - 800);
    cancel();
  });

  it("does nothing further once the end is stable", () => {
    const metrics = { scrollTop: 0, clientHeight: 600, scrollHeight: 2000 };
    const container = makeContainer(metrics);
    settleScrollAtEnd(container);
    act(() => {
      vi.advanceTimersByTime(16 * 10);
    });
    expect(metrics.scrollTop).toBe(1400);
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    act(() => {
      vi.advanceTimersByTime(16 * 10);
    });
    expect(rafSpy).not.toHaveBeenCalled();
    // Restore, or later tests would drive a stale fake clock through the spy.
    rafSpy.mockRestore();
  });
});

describe("settleScrollAtTop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  // A virtualized list unmounting rows above the viewport pushes the position
  // back down after a jump to the top; the loop must hold it at 0.
  it("re-targets the top while rows above shift the position", () => {
    const metrics = { scrollTop: 53686, clientHeight: 800, scrollHeight: 60000 };
    const container = makeContainer(metrics);
    let pushes = 3;
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      get: () => metrics.scrollTop,
      set: (v: number) => {
        // The first few frames the layout shifts the position down again.
        metrics.scrollTop = pushes-- > 0 ? v + 1200 : v;
      },
    });
    settleScrollAtTop(container);
    act(() => {
      vi.advanceTimersByTime(16 * 20);
    });
    expect(metrics.scrollTop).toBe(0);
  });

  it("jumps instantly when the distance exceeds a couple of viewports", () => {
    const container = makeContainer({ scrollTop: 800 * (SMOOTH_MAX_VIEWPORTS + 1), clientHeight: 800, scrollHeight: 60000 });
    renderWithI18n(
      <JumpToLatestButton container={container} composerRef={createRef<HTMLElement>()} stickyComposer={false} />,
    );
    scrollTo(container, 800 * SMOOTH_MAX_VIEWPORTS + 400);
    fireEvent.click(screen.getByRole("button", { name: "Jump to top" }));
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });
});
