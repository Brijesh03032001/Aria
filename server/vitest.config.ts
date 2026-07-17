import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Dummy key so module-load-time LLM client construction (e.g. the
    // supervisor's classifier model) doesn't throw when tests import it.
    // Tests only exercise pure/deterministic functions — no real API calls.
    env: {
      ANTHROPIC_API_KEY: "test-key-unit-tests-only",
    },
  },
});
