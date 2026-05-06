// Re-exports useDeepgramSTT under the name useOpenAISTT.
// VoiceAgent.tsx imports this hook by name — both have identical signatures.
export { useDeepgramSTT as useOpenAISTT } from "./useDeepgramSTT";
