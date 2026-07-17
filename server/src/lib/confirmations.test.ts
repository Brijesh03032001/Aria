import { describe, it, expect, afterEach, vi } from "vitest";
import {
  requestConfirmation,
  getPendingConfirmation,
  clearConfirmation,
  isAffirmative,
  isNegative,
} from "./confirmations.js";

describe("confirmation store", () => {
  afterEach(() => {
    clearConfirmation("test-session-1");
    vi.restoreAllMocks();
  });

  it("returns null when nothing is pending", () => {
    expect(getPendingConfirmation("no-such-session")).toBeNull();
  });

  it("stores and retrieves a pending confirmation", () => {
    requestConfirmation("test-session-1", {
      agentCategory: "commerce",
      description: "Buy the headphones for $50?",
      resumeInstruction: "click Buy Now",
    });
    const pending = getPendingConfirmation("test-session-1");
    expect(pending).not.toBeNull();
    expect(pending?.agentCategory).toBe("commerce");
    expect(pending?.resumeInstruction).toBe("click Buy Now");
  });

  it("clears a pending confirmation", () => {
    requestConfirmation("test-session-1", {
      agentCategory: "coding",
      description: "Run rm -rf?",
      resumeInstruction: "rm -rf /tmp/scratch",
    });
    clearConfirmation("test-session-1");
    expect(getPendingConfirmation("test-session-1")).toBeNull();
  });

  it("expires a pending confirmation after the TTL", () => {
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow);
    requestConfirmation("test-session-1", {
      agentCategory: "desktop",
      description: "Type sensitive text?",
      resumeInstruction: "type something",
    });

    // Jump forward past the 2-minute TTL
    vi.spyOn(Date, "now").mockReturnValue(realNow + 3 * 60 * 1000);
    expect(getPendingConfirmation("test-session-1")).toBeNull();
  });

  it("a fresh confirmation overwrites an older pending one for the same session", () => {
    requestConfirmation("test-session-1", {
      agentCategory: "commerce",
      description: "first",
      resumeInstruction: "first action",
    });
    requestConfirmation("test-session-1", {
      agentCategory: "commerce",
      description: "second",
      resumeInstruction: "second action",
    });
    expect(getPendingConfirmation("test-session-1")?.resumeInstruction).toBe("second action");
  });
});

describe("isAffirmative", () => {
  it.each(["yes", "Yeah", "YEP", "confirm", "confirmed", "do it", "go ahead", "sure", "ok", "okay", "buy it"])(
    "matches %j",
    (text) => {
      expect(isAffirmative(text)).toBe(true);
    },
  );

  it("does not match unrelated text", () => {
    expect(isAffirmative("search for headphones")).toBe(false);
  });
});

describe("isNegative", () => {
  it.each(["no", "Nope", "cancel", "stop", "don't", "never mind"])("matches %j", (text) => {
    expect(isNegative(text)).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(isNegative("okay let's do it")).toBe(false);
  });
});
