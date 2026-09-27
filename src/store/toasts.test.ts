import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./index";

const push = (t: Parameters<ReturnType<typeof useStore.getState>["pushToast"]>[0]) =>
  useStore.getState().pushToast(t);

describe("pushToast", () => {
  beforeEach(() => useStore.setState({ toasts: [] }));

  it("merges identical toasts into one with a count", () => {
    for (let i = 0; i < 5; i++) push({ kind: "error", title: "Paper IBKR: sync failed", body: "HTTP 400" });
    const { toasts } = useStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.count).toBe(5);
  });

  it("replaces a keyed toast when its message changes, resetting the count", () => {
    push({ key: "sync:a", kind: "error", title: "A: sync failed", body: "x" });
    push({ key: "sync:a", kind: "error", title: "A: sync failed", body: "x" });
    push({ key: "sync:a", kind: "success", title: "A: synced 3 trades" });
    const { toasts } = useStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ kind: "success", count: 1 });
  });

  it("caps the stack, dropping the oldest", () => {
    for (let i = 0; i < 6; i++) push({ kind: "info", title: `t${i}` });
    expect(useStore.getState().toasts.map((t) => t.title)).toEqual(["t3", "t4", "t5"]);
  });
});
