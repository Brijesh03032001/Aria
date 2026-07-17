import { scanForPii } from "./pii.js";

// ── Ethics / Safety Gate ─────────────────────────────────────
// Deterministic, synchronous rule table sitting between an agent's decision
// to act and the tool actually firing. Two verdicts only:
//   "allow"   — proceed normally
//   "confirm" — irreversible/risky enough that the user must say yes first
// (No silent hard-block: everything here is something the user CAN still
// do, just not without hearing it spoken back first.)

export type EthicsVerdict = "allow" | "confirm";

export interface EthicsCheck {
  verdict: EthicsVerdict;
  rule: string | null;
  reason: string | null; // spoken-safe, TTS-ready
}

export interface EthicsInput {
  agentCategory: string;
  toolName: string;
  args: Record<string, unknown>;
  budgetRemaining?: number | null;
}

interface EthicsRule {
  name: string;
  applies: (input: EthicsInput) => boolean;
  reason: (input: EthicsInput) => string;
}

const DESTRUCTIVE_CMD_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+(\/|\*|~|\$HOME)/i,
  /\brm\s+-rf\s+\.\.\//i,
  /\bgit\s+push\s+[^\n]*--force/i,
  /\bgit\s+reset\s+--hard/i,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bgit\s+branch\s+-D\b/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/(sd|nvme|disk)/i,
  /\bchmod\s+-R\s+777\s+\//i,
  /\bsudo\s+rm\b/i,
  /curl[^|\n]*\|\s*(sudo\s+)?bash/i,
  /\b(shutdown|reboot)\b/i,
  /\bdrop\s+(table|database)\b/i,
];

const PURCHASE_KEYWORDS =
  /\b(place\s+the?\s*order|confirm\s+order|complete\s+purchase|submit\s+payment|proceed\s+to\s+pay|pay\s+now|buy\s+now|checkout)\b/i;

function commandText(input: EthicsInput): string {
  return String(input.args.command ?? "");
}

function instructionText(input: EthicsInput): string {
  return String(input.args.instruction ?? input.args.action ?? "");
}

function typedText(input: EthicsInput): string {
  return String(input.args.text ?? "");
}

const RULES: EthicsRule[] = [
  {
    name: "destructive_shell_command",
    applies: (i) =>
      i.toolName === "run_command" &&
      DESTRUCTIVE_CMD_PATTERNS.some((re) => re.test(commandText(i))),
    reason: () =>
      "That command could cause irreversible damage. Say yes if you really want me to run it.",
  },
  {
    name: "over_budget_purchase",
    applies: (i) =>
      (i.toolName === "click_element" || i.toolName === "act") &&
      PURCHASE_KEYWORDS.test(instructionText(i)) &&
      typeof i.budgetRemaining === "number" &&
      i.budgetRemaining < 0,
    reason: (i) =>
      `This purchase would put you about $${Math.abs(i.budgetRemaining ?? 0).toFixed(2)} over your budget. Say yes to buy it anyway, or no and I'll look for something cheaper.`,
  },
  {
    name: "checkout_purchase_confirm",
    applies: (i) =>
      (i.toolName === "click_element" || i.toolName === "act") &&
      PURCHASE_KEYWORDS.test(instructionText(i)),
    reason: () =>
      "You're about to complete a purchase. Say yes to confirm, or no to cancel.",
  },
  {
    name: "pii_in_typed_text",
    applies: (i) =>
      (i.toolName === "type" || i.toolName === "computer_type") &&
      scanForPii(typedText(i)).found,
    reason: (i) => {
      const types = [...new Set(scanForPii(typedText(i)).matches.map((m) => m.type))].join(", ");
      return `That text looks like it contains sensitive information (${types}). Say yes to type it anyway, or no to cancel.`;
    },
  },
];

/**
 * Check a proposed tool call against the rule table.
 * Pure and synchronous — safe to call on every tool invocation with no
 * added latency.
 */
export function checkEthics(input: EthicsInput): EthicsCheck {
  for (const rule of RULES) {
    if (rule.applies(input)) {
      console.log(`[ethics] CONFIRM required — rule=${rule.name} agent=${input.agentCategory} tool=${input.toolName}`);
      return { verdict: "confirm", rule: rule.name, reason: rule.reason(input) };
    }
  }
  return { verdict: "allow", rule: null, reason: null };
}
