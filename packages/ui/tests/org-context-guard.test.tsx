import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORG_CONTEXT_LOST_EVENT } from "@workspace/shared";
import { OrgContextGuard } from "../src/components/org-context-guard";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

describe("OrgContextGuard", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  afterEach(() => {
    // RTL auto-cleanup is not registered when Vitest runs with `globals: false`.
    cleanup();
  });

  it("navigates to /reset-org-context when the client reports a lost org", () => {
    render(<OrgContextGuard />);

    act(() => {
      window.dispatchEvent(new Event(ORG_CONTEXT_LOST_EVENT));
    });

    expect(replace).toHaveBeenCalledWith("/reset-org-context");
  });

  it("stops listening after unmount", () => {
    const { unmount } = render(<OrgContextGuard />);
    unmount();

    act(() => {
      window.dispatchEvent(new Event(ORG_CONTEXT_LOST_EVENT));
    });

    expect(replace).not.toHaveBeenCalled();
  });
});
