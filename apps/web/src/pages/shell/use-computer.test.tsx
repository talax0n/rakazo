// @vitest-environment jsdom

import { COMPUTER_ALLOWANCE_USED_ERROR } from "@rakazo/contracts";
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { screenFrames } from "../../lib/computer-screen";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) => String.raw(parts, ...values),
  }),
}));
vi.mock("@rakazo/ui-web", () => ({
  Button: (props: ComponentProps<"button">) => <button type="button" {...props} />,
  Spinner: () => null,
}));
vi.mock("../../components/ComputerMaintenanceActions", () => ({
  ComputerMaintenanceActions: () => null,
}));

import type { ComputerState } from "./use-computer";
import { useComputerControls, useComputerState } from "./use-computer";

let container: HTMLDivElement;
let root: Root;
let state: ComputerState;
let screenUrlFactory: () => string = () => "/novnc/session/view/1.default/vnc.html";
const screenUrl = vi.fn(async () => ({ url: screenUrlFactory() }));

/** The hook with the frame the panel draws: gone while an error replaces the screen. */
function Harness() {
  state = useComputerState({
    rpc: { computer: { screenUrl } } as never,
    panel: "computer",
    activeId: "bot-1",
    activeBotId: { current: "bot-1" },
  });
  if (!state.screenUrl || state.screenLoadError) return null;
  // Drawn as the panel and overlay draw it: a held predecessor first, then the live frame.
  return screenFrames(state.screenFrameKey, state.screenUrl, state.heldScreen).map((frame) => (
    <iframe
      key={frame.key}
      ref={frame.held ? undefined : state.setScreenFrame}
      data-src={frame.url}
      aria-hidden={frame.held || undefined}
      title="screen"
    />
  ));
}

async function read() {
  await act(async () => {
    await state.refreshComputerScreen("bot-1");
  });
}

async function report(rakazoScreen: string) {
  const frame = container.querySelector("iframe");
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", { data: { rakazoScreen }, source: frame?.contentWindow }),
    );
  });
}

beforeEach(async () => {
  vi.useFakeTimers();
  screenUrlFactory = () => "/novnc/session/view/1.default/vnc.html";
  screenUrl.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("reconnects a proxied screen whose reload raced a restart, without the error", async () => {
  screenUrlFactory = () => "/novnc/session/view/1.restart/vnc.html";
  await read();
  await report("connected");
  // The screen restarts under the viewer: the proxy closes the socket, the app reloads the
  // page, and the screen server refuses that reload's connection once.
  await report("disconnected");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
  await report("failed");
  expect(state.screenLoadError).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });
  await report("connected");
  expect(state.screenLoadError).toBeNull();
  expect(container.querySelector("iframe")).not.toBeNull();
});

it("shows a proxied screen's error only after its reloads stop connecting", async () => {
  screenUrlFactory = () => "/novnc/session/view/1.stuck/vnc.html";
  await read();
  await report("connected");
  await report("disconnected");
  for (const wait of [1_000, 2_000, 4_000]) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(wait);
    });
    expect(state.screenLoadError).toBeNull();
    await report("failed");
  }
  expect(state.screenLoadError).toBe("Could not connect to the computer screen");
  expect(container.querySelector("iframe")).toBeNull();
});

const proxied = (policy: "view" | "control", token: string) =>
  `/novnc/session/${policy}/9999999999999.${token}/embed.html`;

async function reportFrom(frame: HTMLIFrameElement, rakazoScreen: string) {
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", { data: { rakazoScreen }, source: frame.contentWindow }),
    );
  });
}

it("keeps the replaced screen over its successor until that one connects", async () => {
  screenUrlFactory = () => proxied("view", "v1");
  await read();
  const viewFrame = container.querySelector("iframe")!;
  screenUrlFactory = () => proxied("control", "c1");
  await read();
  let frames = [...container.querySelectorAll("iframe")];
  expect(frames).toHaveLength(2);
  // The same element stays, so its page does not reload.
  expect(frames[0]).toBe(viewFrame);
  expect(frames[0]!.getAttribute("aria-hidden")).toBe("true");
  expect(frames[1]!.dataset.src).toContain("/control/");
  await reportFrom(frames[1]!, "connecting");
  expect(container.querySelectorAll("iframe")).toHaveLength(2);
  await reportFrom(frames[1]!, "connected");
  frames = [...container.querySelectorAll("iframe")];
  expect(frames).toHaveLength(1);
  expect(frames[0]!.dataset.src).toContain("/control/");
});

it("shows the remembered view at once on release and returns to control if it fails", async () => {
  const pending = { reject: (_error: Error) => {} };
  const release = vi.fn(
    () =>
      new Promise<never>((_resolve, reject) => {
        pending.reject = reject;
      }),
  );
  let controls!: ReturnType<typeof useComputerControls>;
  function Controls() {
    controls = useComputerControls({
      rpc: { computer: { release, screenUrl } } as never,
      state,
      panel: "computer",
      active: undefined,
      bots: [],
      botsRef: { current: [] },
      activeBotId: { current: "bot-1" },
      activeGroupId: { current: undefined },
      runStatus: undefined,
      sandboxProvider: undefined,
      refreshThread: vi.fn(async () => ({}) as never),
      refreshGroupThread: vi.fn(),
      onUpgrade: vi.fn(),
    });
    return null;
  }
  await act(async () =>
    root.render(
      <>
        <Harness />
        <Controls />
      </>,
    ),
  );
  screenUrlFactory = () => proxied("view", "v1");
  await read();
  screenUrlFactory = () => proxied("control", "c1");
  await read();
  let released!: Promise<void>;
  await act(async () => {
    released = controls.releaseComputer();
  });
  expect(release).toHaveBeenCalled();
  expect(state.screenUrl).toBe(proxied("view", "v1"));
  await act(async () => {
    pending.reject(new Error("offline"));
    await released;
  });
  expect(state.screenUrl).toBe(proxied("control", "c1"));
});

it("closes the computer view on Escape, but not on the Escape that ends an IME composition", async () => {
  function Controls() {
    state = useComputerState({
      rpc: {} as never,
      panel: null,
      activeId: undefined,
      activeBotId: { current: undefined },
    });
    useComputerControls({
      rpc: {} as never,
      state,
      panel: null,
      active: undefined,
      bots: [],
      botsRef: { current: [] },
      activeBotId: { current: undefined },
      activeGroupId: { current: undefined },
      runStatus: undefined,
      sandboxProvider: undefined,
      refreshThread: vi.fn(),
      refreshGroupThread: vi.fn(),
      onUpgrade: vi.fn(),
    });
    // Stands in for the view's "Teach a task" goal box, whose popover lets a composing Escape bubble.
    return <textarea aria-label="Goal" />;
  }
  await act(async () => root.render(<Controls />));
  await act(async () => state.setComputerOpen(true));
  const goal = container.querySelector("textarea")!;
  const press = (init: KeyboardEventInit = {}) =>
    act(async () => {
      goal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, ...init }));
    });
  await press({ isComposing: true });
  await press({ keyCode: 229 });
  expect(state.computerOpen).toBe(true);
  await press();
  expect(state.computerOpen).toBe(false);
});

it("offers Upgrade instead of a retry once the computer hours are spent", async () => {
  const onUpgrade = vi.fn();
  function Controls() {
    state = useComputerState({
      rpc: {} as never,
      panel: null,
      activeId: undefined,
      activeBotId: { current: undefined },
    });
    const controls = useComputerControls({
      rpc: {} as never,
      state,
      panel: null,
      active: undefined,
      bots: [],
      botsRef: { current: [] },
      activeBotId: { current: undefined },
      activeGroupId: { current: undefined },
      runStatus: undefined,
      sandboxProvider: undefined,
      refreshThread: vi.fn(),
      refreshGroupThread: vi.fn(),
      onUpgrade,
    });
    return <>{controls.computerScreenError}</>;
  }
  await act(async () => root.render(<Controls />));
  await act(async () => state.setComputerError(COMPUTER_ALLOWANCE_USED_ERROR));
  const buttons = [...container.querySelectorAll("button")].map((button) => button.textContent);
  expect(buttons).toEqual(["Upgrade"]);
  await act(async () => container.querySelector("button")!.click());
  expect(onUpgrade).toHaveBeenCalledOnce();
  await act(async () => state.commitComputer({ state: "running", kind: "browser" } as never));
  expect(container.textContent).not.toContain("Upgrade");
});
