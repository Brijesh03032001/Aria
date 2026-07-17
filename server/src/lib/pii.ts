// ── PII Detector ─────────────────────────────────────────────
// Shared regex-based scanner reused by the ethics gate wherever an agent
// is about to speak, type, or persist user-supplied text (commerce forms,
// Notes dictation, coding tool output/logs).

export interface PiiMatch {
  type: "ssn" | "credit_card" | "email" | "phone";
  snippet: string; // redacted, safe to log/speak
}

export interface PiiScanResult {
  found: boolean;
  matches: PiiMatch[];
}

const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDIT_CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const PHONE_RE = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

function luhnCheck(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function redact(s: string): string {
  const compact = s.replace(/\s+/g, "");
  if (compact.length <= 4) return "*".repeat(compact.length);
  return "*".repeat(compact.length - 4) + compact.slice(-4);
}

/**
 * Scan free text for SSNs, credit card numbers, emails, and phone numbers.
 * Pure sync function — no I/O, no external calls.
 */
export function scanForPii(text: string): PiiScanResult {
  if (!text) return { found: false, matches: [] };

  const matches: PiiMatch[] = [];

  for (const m of text.match(SSN_RE) ?? []) {
    matches.push({ type: "ssn", snippet: redact(m) });
  }

  for (const m of text.match(CREDIT_CARD_RE) ?? []) {
    const digitsOnly = m.replace(/[ -]/g, "");
    if (digitsOnly.length < 13 || digitsOnly.length > 19) continue;
    if (!luhnCheck(digitsOnly)) continue;
    matches.push({ type: "credit_card", snippet: redact(m) });
  }

  for (const m of text.match(EMAIL_RE) ?? []) {
    matches.push({ type: "email", snippet: redact(m) });
  }

  for (const m of text.match(PHONE_RE) ?? []) {
    // Skip matches already captured as part of a credit card / SSN run
    if (matches.some((x) => x.snippet.endsWith(m.slice(-4)) && m.length <= 12)) continue;
    matches.push({ type: "phone", snippet: redact(m) });
  }

  return { found: matches.length > 0, matches };
}
