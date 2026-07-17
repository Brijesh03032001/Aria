import type { AgentCategory } from "../types/index.js";

// ── Pending Confirmation Store ──────────────────────────────
// Session-scoped, in-memory (module-level Map keyed by sessionId — mirrors
// the sessionId-filter pattern already used by the Elasticsearch knowledge
// base). Holds the ONE action currently awaiting a spoken yes/no from the
// user, so the next turn can resume it without re-classifying "yes" as a
// new, unrelated request.

export interface PendingConfirmation {
  agentCategory: AgentCategory;
  description: string; // spoken-safe: what the user is being asked to confirm
  resumeInstruction: string; // what to tell the agent to do once confirmed
  createdAt: number;
}

const TTL_MS = 2 * 60 * 1000; // 2 minutes — stale confirmations auto-expire

const pending = new Map<string, PendingConfirmation>();

export function requestConfirmation(
  sessionId: string,
  entry: Omit<PendingConfirmation, "createdAt">,
): void {
  pending.set(sessionId, { ...entry, createdAt: Date.now() });
}

export function getPendingConfirmation(sessionId: string): PendingConfirmation | null {
  const p = pending.get(sessionId);
  if (!p) return null;
  if (Date.now() - p.createdAt > TTL_MS) {
    pending.delete(sessionId);
    return null;
  }
  return p;
}

export function clearConfirmation(sessionId: string): void {
  pending.delete(sessionId);
}

const YES_RE = /^(yes|yeah|yep|yup|confirm|confirmed|correct|do it|go ahead|proceed|buy it|place the order|sure|ok|okay)\b/i;
const NO_RE = /^(no|nope|nah|cancel|stop|don't|do not|never\s?mind)\b/i;

export function isAffirmative(text: string): boolean {
  return YES_RE.test(text.trim());
}

export function isNegative(text: string): boolean {
  return NO_RE.test(text.trim());
}
