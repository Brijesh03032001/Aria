import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";

const RUNWARE_MODEL = "google:gemini@3.5-flash";
const RUNWARE_BASE_URL = "https://api.runware.ai/v1";

interface AgentModelOptions {
  temperature: number;
  maxTokens: number;
}

// Priority: OPENAI_API_KEY → RUNWARE_API_KEY (Gemini Flash) → ANTHROPIC_API_KEY
// OpenAI checked first here (unlike the classifier) because these agents bind
// tools in a multi-turn ReAct loop, and Runware's Gemini proxy 400s on any
// follow-up request containing a tool-result message — verified against
// google:gemini@3.5-flash, 3.1-flash-lite, and 3-flash, all fail identically.
export function buildAgentModel({ temperature, maxTokens }: AgentModelOptions) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const runwareKey = process.env.RUNWARE_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openaiKey) {
    return new ChatOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-4.1",
      temperature: process.env.OPENAI_TEMPERATURE
        ? parseFloat(process.env.OPENAI_TEMPERATURE)
        : temperature,
      maxTokens,
    });
  }

  if (runwareKey) {
    return new ChatOpenAI({
      model: RUNWARE_MODEL,
      temperature,
      maxTokens,
      configuration: {
        baseURL: RUNWARE_BASE_URL,
        apiKey: runwareKey,
      },
    });
  }

  if (anthropicKey) {
    return new ChatAnthropic({ model: "claude-haiku-4-5", temperature, maxTokens });
  }

  throw new Error(
    "No LLM key found for agent. Set one of: OPENAI_API_KEY, RUNWARE_API_KEY, or ANTHROPIC_API_KEY",
  );
}
