import { Stagehand } from "@browserbasehq/stagehand";
import type { ZodTypeAny } from "zod";
import os from "os";
import path from "path";
import { existsSync } from "fs";
import type {
  ExtractResult,
  ActResult,
  ObserveResult,
  NavigateResult,
  ExecutionContext,
} from "../types/index.js";

let instance: Stagehand | null = null;

// Path where browser session (cookies/localStorage) is saved between restarts
const SESSION_STATE_PATH = path.join(os.homedir(), ".rcy-browser-state.json");

/**
 * Initialize Stagehand using Playwright's bundled Chromium.
 * Never uses the system Chrome — that causes ECONNREFUSED because Chrome
 * doesn't expose a CDP port unless Playwright launches it with its own flags.
 * Sessions are persisted via storageState so logins survive restarts.
 */
export async function initStagehand(): Promise<void> {
  if (instance) return;

  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "OPENAI_API_KEY not set — Stagehand browser automation will be unavailable",
    );
    return;
  }

  const storageState = existsSync(SESSION_STATE_PATH)
    ? SESSION_STATE_PATH
    : undefined;

  if (storageState) {
    console.log("[Stagehand] Restoring saved browser session from", SESSION_STATE_PATH);
  } else {
    console.log("[Stagehand] No saved session — starting fresh (cookies will be saved on close)");
  }

  instance = new Stagehand({
    env: "LOCAL",
    model: {
      modelName: "openai/gpt-4.1",
      apiKey: process.env.OPENAI_API_KEY,
    },
    localBrowserLaunchOptions: {
      headless: false,
      ...(storageState ? { storageState } : {}),
    },
    verbose: 0,
  });

  await instance.init();
  console.log("[Stagehand] Initialized — Playwright Chromium running (visible)");
}

/** Return the singleton Stagehand instance, or null if not initialized. */
export function getStagehand(): Stagehand | null {
  return instance;
}

/** Save session cookies/storage so logins survive the next restart. */
export async function saveStagehandSession(): Promise<void> {
  if (!instance) return;
  try {
    const page = instance.context?.pages()[0];
    if (page) {
      await instance.context.storageState({ path: SESSION_STATE_PATH });
      console.log("[Stagehand] Session saved to", SESSION_STATE_PATH);
    }
  } catch {
    // best-effort
  }
}

/** Gracefully close the browser and release resources. */
export async function closeStagehand(): Promise<void> {
  if (!instance) return;
  try {
    await saveStagehandSession();
    await instance.close();
  } catch {
    // best-effort cleanup
  }
  instance = null;
}

/**
 * Create an ExecutionContext that wraps Stagehand.
 * Every method catches errors and returns a typed result — never throws.
 */
export function createExecutionContext(): ExecutionContext | null {
  if (!instance) return null;

  const stagehand = instance;

  return {
    async extract(
      instruction: string,
      schema?: ZodTypeAny,
    ): Promise<ExtractResult> {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = schema
          ? await stagehand.extract(instruction, schema as any)
          : await stagehand.extract(instruction);
        return {
          success: true,
          data: (typeof result === "object" ? result : { extraction: result }) as Record<string, unknown>,
        };
      } catch (err) {
        return {
          success: false,
          data: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async act(instruction: string): Promise<ActResult> {
      const MAX_RETRIES = 3;

      async function attemptAct(): Promise<ActResult> {
        try {
          const result = await stagehand.act(instruction);
          const page = stagehand.context.pages()[0];
          return {
            success: result.success,
            description: result.actionDescription || result.message,
            newUrl: page?.url() ?? undefined,
          };
        } catch (err) {
          return {
            success: false,
            description: "",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const result = await attemptAct();
        if (result.success) return result;

        if (attempt < MAX_RETRIES) {
          console.log(`[stagehand] act() attempt ${attempt} failed, scrolling down and retrying...`);
          try {
            const page = stagehand.context.pages()[0];
            if (page) {
              await page.evaluate(() => window.scrollBy(0, 400));
              await new Promise((r) => setTimeout(r, 500));
            }
          } catch {
            // scroll failed — still retry
          }
        } else {
          console.log(`[stagehand] act() failed after ${MAX_RETRIES} attempts: ${result.error}`);
          return result;
        }
      }

      // Unreachable, but satisfies TS
      return { success: false, description: "", error: "Max retries exceeded" };
    },

    async observe(instruction?: string): Promise<ObserveResult> {
      try {
        const actions = instruction
          ? await stagehand.observe(instruction)
          : await stagehand.observe();
        return {
          success: true,
          actions: actions.map((a) => ({
            description: a.description,
            selector: a.selector,
            method: a.method,
          })),
        };
      } catch (err) {
        return {
          success: false,
          actions: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async navigate(url: string): Promise<NavigateResult> {
      try {
        const page = stagehand.context.pages()[0];
        if (!page) {
          return {
            success: false,
            finalUrl: "",
            pageTitle: "",
            error: "No browser page available",
          };
        }
        console.log(`[Stagehand] Navigating to: ${url}`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeoutMs: 15000 });
        const finalUrl = page.url();
        const title = await page.title();
        console.log(`[stagehand] navigation complete: ${title} (${finalUrl})`);
        return { success: true, finalUrl, pageTitle: title };
      } catch (err) {
        console.warn(`[Stagehand] Navigation error for ${url}:`, err instanceof Error ? err.message : err);
        return {
          success: false,
          finalUrl: "",
          pageTitle: "",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
