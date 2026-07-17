import { describe, it, expect } from "vitest";
import { scanForPii } from "./pii.js";

describe("scanForPii", () => {
  it("detects a valid SSN", () => {
    const result = scanForPii("My social is 123-45-6789, please note it.");
    expect(result.found).toBe(true);
    expect(result.matches.some((m) => m.type === "ssn")).toBe(true);
  });

  it("detects a Luhn-valid credit card number", () => {
    const result = scanForPii("Card number: 4111 1111 1111 1111 expires soon");
    expect(result.found).toBe(true);
    expect(result.matches.some((m) => m.type === "credit_card")).toBe(true);
  });

  it("does not flag a Luhn-invalid 16-digit number as a credit card", () => {
    const result = scanForPii("Reference number 1234 5678 9012 3456 for the order");
    expect(result.matches.some((m) => m.type === "credit_card")).toBe(false);
  });

  it("detects an email address", () => {
    const result = scanForPii("Reach me at jane.doe@example.com anytime");
    expect(result.matches.some((m) => m.type === "email")).toBe(true);
  });

  it("detects a phone number", () => {
    const result = scanForPii("Call me at (555) 123-4567 tomorrow");
    expect(result.matches.some((m) => m.type === "phone")).toBe(true);
  });

  it("returns found: false for clean text", () => {
    const result = scanForPii("Add the wireless headphones to my cart please");
    expect(result.found).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it("returns found: false for empty text", () => {
    expect(scanForPii("").found).toBe(false);
  });

  it("redacts the matched snippet, keeping only the last 4 characters", () => {
    const result = scanForPii("SSN: 123-45-6789");
    const ssnMatch = result.matches.find((m) => m.type === "ssn");
    // Dashes count as characters (only whitespace is stripped before masking)
    expect(ssnMatch?.snippet).toBe("*******6789");
    expect(ssnMatch?.snippet.endsWith("6789")).toBe(true);
  });

  it("detects multiple PII types in the same string", () => {
    const result = scanForPii(
      "Email jane@example.com or call 555-123-4567, SSN 123-45-6789",
    );
    const types = new Set(result.matches.map((m) => m.type));
    expect(types.has("email")).toBe(true);
    expect(types.has("phone")).toBe(true);
    expect(types.has("ssn")).toBe(true);
  });
});
