// ── Supervisor Types ──────────────────────────────────────────

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  timestamp?: number;
}

export interface PageSnapshot {
  url: string;
  title: string;
  description?: string;
}

export interface UserProfile {
  name: string;
  preferences: {
    budget: string;
    currency: string;
    preferredStores: string;
    language?: string;
  };
  accessibility?: {
    screenReader?: boolean;
    voiceOnly?: boolean;
  };
}

export type AgentCategory = "commerce" | "coding" | "general" | "desktop" | "documentation";

export interface ClassificationResult {
  category: AgentCategory;
  secondaryCategory?: AgentCategory | null;
  primaryTask?: string | null;
  secondaryTask?: string | null;
  subIntent: string;
  secondarySubIntent?: string | null;
  entities: Record<string, unknown>;
}

export interface SupervisorResult {
  responseText: string;
  agentCategory: AgentCategory;
  actions: unknown[];
}

// ── Execution Layer Types (Stagehand Wrapper) ────────────────

import type { ZodTypeAny } from "zod";

export interface ExtractResult {
  success: boolean;
  data: Record<string, unknown> | null;
  error?: string;
}

export interface ActResult {
  success: boolean;
  description: string;
  newUrl?: string;
  error?: string;
}

export interface ObserveResult {
  success: boolean;
  actions: AvailableAction[];
  error?: string;
}

export interface AvailableAction {
  description: string;
  selector: string;
  method?: string;
}

export interface NavigateResult {
  success: boolean;
  finalUrl: string;
  pageTitle: string;
  error?: string;
}

export interface ExecutionContext {
  extract: (
    instruction: string,
    schema?: ZodTypeAny,
  ) => Promise<ExtractResult>;
  act: (instruction: string) => Promise<ActResult>;
  observe: (instruction?: string) => Promise<ObserveResult>;
  navigate: (url: string) => Promise<NavigateResult>;
}

// ── Voice Pipeline Types ────────────────────────────────────

export type InterimSpeechCallback = (text: string) => void;

// ── Knowledge Base Types (Elasticsearch) ────────────────────

export interface ConversationEntry {
  sessionId: string;
  role: "user" | "assistant";
  text: string;
  agentCategory?: AgentCategory;
  timestamp: string;
}

export interface PageVisit {
  url: string;
  title: string;
  content: string;
  sessionId: string;
  userQuery?: string;
  agentCategory: AgentCategory;
  timestamp: string;
}

export interface ProductViewed {
  url: string;
  title: string;
  name: string;
  price?: string;
  rating?: string;
  store?: string;
  sessionId: string;
  timestamp: string;
}

// ── Audit Log Types ──────────────────────────────────────────

export type AgentActionVerdict =
  | "routed"           // supervisor dispatched a turn to an agent
  | "confirm_required" // ethics gate paused an irreversible/risky action
  | "resumed"          // user said yes — gated action re-attempted
  | "cancelled"        // user said no — gated action dropped
  | "reask";           // ambiguous reply — re-asked, confirmation still pending

export interface AgentActionEntry {
  sessionId: string;
  timestamp: string;
  agentCategory: AgentCategory | string;
  subIntent?: string;
  action: string; // human-readable: what was requested/attempted
  verdict: AgentActionVerdict;
  reason?: string | null;
}

export interface KnowledgeBase {
  getProfile(sessionId: string): Promise<UserProfile | null>;
  updatePreference(sessionId: string, key: string, value: string): Promise<void>;
  indexPageVisit(data: PageVisit): Promise<void>;
  indexProductViewed(data: ProductViewed): Promise<void>;
  searchBrowsingHistory(query: string, sessionId?: string, limit?: number): Promise<PageVisit[]>;
  searchProductsViewed(query: string, sessionId?: string, limit?: number): Promise<ProductViewed[]>;
  fetchMemoryContext(query: string, sessionId?: string): Promise<string>;
  indexConversation(entry: ConversationEntry): Promise<void>;
  searchConversationHistory(query: string, sessionId?: string, limit?: number): Promise<ConversationEntry[]>;
  restoreConversation(sessionId: string, limit?: number): Promise<ConversationEntry[]>;
  indexAgentAction(entry: AgentActionEntry): Promise<void>;
  getAgentActions(sessionId: string, limit?: number): Promise<AgentActionEntry[]>;
  isAvailable(): boolean;
}
