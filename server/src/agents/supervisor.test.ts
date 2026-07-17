import { describe, it, expect, afterEach } from "vitest";
import {
  formatResponse,
  routeByCategory,
  confirmationRouter,
  recheckNode,
  recheckRouter,
  checkConfirmation,
} from "./supervisor.js";
import { requestConfirmation, clearConfirmation, getPendingConfirmation } from "../lib/confirmations.js";

// Infer the (complex, LangGraph-generated) state type from one of the pure
// functions rather than exporting it separately.
type SupervisorStateType = Parameters<typeof routeByCategory>[0] &
  Parameters<typeof formatResponse>[0] &
  Parameters<typeof recheckNode>[0];

function baseState(overrides: Partial<SupervisorStateType> = {}): SupervisorStateType {
  return {
    userInput: "",
    conversationHistory: [],
    classification: null,
    responseText: "",
    agentCategory: "general",
    userProfile: null,
    pageSnapshot: null,
    memoryContext: "",
    secondaryCategory: null,
    agentPhase: 0,
    scopedInput: "",
    ethicsBypass: false,
    confirmationRoute: "classify",
    ...overrides,
  } as SupervisorStateType;
}

describe("routeByCategory", () => {
  it.each([
    ["commerce", "commerceAgent"],
    ["coding", "codingAgent"],
    ["desktop", "desktopAgent"],
    ["documentation", "documentationAgent"],
    ["general", "generalAgent"],
  ] as const)("routes %s → %s", (category, expected) => {
    expect(routeByCategory(baseState({ agentCategory: category }))).toBe(expected);
  });

  it("defaults unrecognized categories to generalAgent", () => {
    expect(routeByCategory(baseState({ agentCategory: "nonsense" as never }))).toBe("generalAgent");
  });
});

describe("formatResponse", () => {
  it("strips bold and italic markdown", () => {
    const result = formatResponse(baseState({ responseText: "This is **bold** and *italic*." }));
    expect(result.responseText).toBe("This is bold and italic.");
  });

  it("strips inline code backticks", () => {
    const result = formatResponse(baseState({ responseText: "Run `npm test` now." }));
    expect(result.responseText).toBe("Run npm test now.");
  });

  it("removes URLs", () => {
    const result = formatResponse(baseState({ responseText: "See https://example.com/page for more." }));
    expect(result.responseText).not.toContain("http");
  });

  it("removes list markers", () => {
    const result = formatResponse(baseState({ responseText: "- first item\n- second item" }));
    expect(result.responseText).not.toMatch(/^-/m);
  });

  it("ensures the response ends with punctuation", () => {
    const result = formatResponse(baseState({ responseText: "Here is your answer" }));
    expect(result.responseText?.endsWith(".")).toBe(true);
  });

  it("collapses extra whitespace and newlines", () => {
    // The punctuation pass runs per-line (multiline $) before newlines
    // collapse, so each line gets its own trailing period.
    const result = formatResponse(baseState({ responseText: "Line one\n\n\nLine   two" }));
    expect(result.responseText).toBe("Line one. Line two.");
  });
});

describe("confirmationRouter", () => {
  it("routes 'resume' through routeByCategory", () => {
    const state = baseState({ confirmationRoute: "resume", agentCategory: "commerce" });
    expect(confirmationRouter(state)).toBe("commerceAgent");
  });

  it("routes 'cancelled' to formatResponse", () => {
    expect(confirmationRouter(baseState({ confirmationRoute: "cancelled" }))).toBe("formatResponse");
  });

  it("routes 'reask' to formatResponse", () => {
    expect(confirmationRouter(baseState({ confirmationRoute: "reask" }))).toBe("formatResponse");
  });

  it("routes anything else to classify", () => {
    expect(confirmationRouter(baseState({ confirmationRoute: "classify" }))).toBe("classify");
  });
});

describe("recheckNode / recheckRouter (compound task chaining)", () => {
  it("chains to the secondary category on phase 0", () => {
    const state = baseState({
      agentPhase: 0,
      agentCategory: "desktop",
      secondaryCategory: "coding",
      classification: { category: "desktop", subIntent: "open_app", secondaryTask: "write a function", entities: {} },
    });
    const result = recheckNode(state);
    expect(result.agentCategory).toBe("coding");
    expect(result.agentPhase).toBe(1);
    expect(result.scopedInput).toBe("write a function");
  });

  it("does not chain when there is no secondary category", () => {
    const result = recheckNode(baseState({ agentPhase: 0, secondaryCategory: null }));
    expect(result.agentPhase).toBe(2);
    expect(result.agentCategory).toBeUndefined();
  });

  it("recheckRouter sends phase 1 back through routeByCategory", () => {
    const state = baseState({ agentPhase: 1, agentCategory: "coding" });
    expect(recheckRouter(state)).toBe("codingAgent");
  });

  it("recheckRouter sends any other phase to formatResponse", () => {
    expect(recheckRouter(baseState({ agentPhase: 2 }))).toBe("formatResponse");
  });
});

describe("checkConfirmation", () => {
  const sessionId = "supervisor-test-session";

  afterEach(() => {
    clearConfirmation(sessionId);
  });

  it("routes to classify when there is no sessionId", async () => {
    const result = await checkConfirmation(baseState({ userInput: "yes" }), undefined, null);
    expect(result.confirmationRoute).toBe("classify");
  });

  it("routes to classify when there is no pending confirmation", async () => {
    const result = await checkConfirmation(
      baseState({ userInput: "yes" }),
      { configurable: { sessionId } },
      null,
    );
    expect(result.confirmationRoute).toBe("classify");
  });

  it("resumes the pending action on an affirmative reply", async () => {
    requestConfirmation(sessionId, {
      agentCategory: "commerce",
      description: "Buy the headphones for $50?",
      resumeInstruction: "click Buy Now",
    });

    const result = await checkConfirmation(
      baseState({ userInput: "yes go ahead" }),
      { configurable: { sessionId } },
      null,
    );

    expect(result.confirmationRoute).toBe("resume");
    expect(result.agentCategory).toBe("commerce");
    expect(result.ethicsBypass).toBe(true);
    expect(result.scopedInput).toContain("click Buy Now");
    expect(getPendingConfirmation(sessionId)).toBeNull(); // consumed
  });

  it("cancels the pending action on a negative reply", async () => {
    requestConfirmation(sessionId, {
      agentCategory: "coding",
      description: "Run rm -rf /tmp/scratch?",
      resumeInstruction: "rm -rf /tmp/scratch",
    });

    const result = await checkConfirmation(
      baseState({ userInput: "no, cancel that" }),
      { configurable: { sessionId } },
      null,
    );

    expect(result.confirmationRoute).toBe("cancelled");
    expect(result.responseText).toMatch(/cancelled/i);
    expect(getPendingConfirmation(sessionId)).toBeNull();
  });

  it("re-asks and keeps the confirmation alive on an ambiguous reply", async () => {
    requestConfirmation(sessionId, {
      agentCategory: "documentation",
      description: "Write that sensitive note anyway?",
      resumeInstruction: "type the note",
    });

    const result = await checkConfirmation(
      baseState({ userInput: "what do you mean" }),
      { configurable: { sessionId } },
      null,
    );

    expect(result.confirmationRoute).toBe("reask");
    expect(getPendingConfirmation(sessionId)).not.toBeNull(); // still pending
  });
});
