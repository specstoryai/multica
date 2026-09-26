import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createRef } from "react";
import { renderWithI18n } from "../../test/i18n";
import { JumpToLatestButton } from "./jump-to-latest";
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
    act(() => {
      fireEvent.scroll(container);
    });
    const wrapper = screen.getByTestId("jump-to-latest");
    expect(wrapper).toHaveAttribute("data-state", "visible");
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
    const metrics = { scrollTop: 1400, clientHeight: 600, scrollHeight: 2000 };
    const container = makeContainer(metrics);
    renderButton(container);
    act(() => {
      fireEvent.scroll(container);
    });
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-state", "hidden");
  });

  it("hides as soon as a scroll reaches the end", () => {
    const metrics = { scrollTop: 0, clientHeight: 600, scrollHeight: 2000 };
    const container = makeContainer(metrics);
    renderButton(container);
    act(() => {
      fireEvent.scroll(container);
    });
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-state", "visible");
    metrics.scrollTop = 1400;
    act(() => {
      fireEvent.scroll(container);
    });
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-state", "hidden");
  });

  it("holds while hovered, then fades after leaving", () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 600, scrollHeight: 2000 });
    renderButton(container);
    act(() => {
      fireEvent.scroll(container);
    });
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
    act(() => {
      fireEvent.scroll(container);
    });
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
    act(() => {
      fireEvent.scroll(container);
    });
    fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: "auto" });
  });

  it("follows the pointer on desktop and centres near the bottom on a phone", () => {
    const container = makeContainer({ scrollTop: 0, clientHeight: 600, scrollHeight: 2000 });
    const { unmount } = renderButton(container);
    fireEvent.pointerMove(container, { clientX: 300, clientY: 200 });
    act(() => {
      fireEvent.scroll(container);
    });
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-placement", "pointer");
    unmount();

    setViewportWidth(390);
    renderButton(container);
    act(() => {
      fireEvent.scroll(container);
    });
    expect(screen.getByTestId("jump-to-latest")).toHaveAttribute("data-placement", "bottom");
  });
});
