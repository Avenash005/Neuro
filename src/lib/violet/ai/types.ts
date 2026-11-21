/**
 * VIOLET AI — Production Multi-Model Intelligence Types
 *
 * Defines unified contracts for provider adapters, intelligent model routing,
 * privacy policy enforcement, normalized responses, and model capability metadata.
 */

import type { CircuitBreaker } from "./circuitBreaker";

export type AIProviderType =
  | "ollama"
  | "openrouter"
  | "openai"
  | "gemini"
  | "anthropic";

export type ModelDeploymentType = "local" | "cloud";

export type PrivacyPolicy = "AUTO" | "LOCAL_ONLY" | "CLOUD_ONLY";

export type CostPreference = "minimize_cost" | "balance" | "max_performance";

export type LatencyPreference = "low_latency" | "standard";

export type TaskCategory =
  | "general_chat"
  | "reasoning"
  | "coding"
  | "vision"
  | "summarization"
  | "desktop_planning"
  | "structured_output";

export type FinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "error"
  | "cancelled";

export interface ModelCapabilities {
  text: boolean;
  vision: boolean;
  tool_calling: boolean;
  structured_output: boolean;
  streaming: boolean;
  context_window: number;
  local_or_cloud: ModelDeploymentType;
}

export interface ModelDefinition {
  id: string;
  name: string;
  provider: AIProviderType;
  capabilities: ModelCapabilities;
  description?: string;
  available: boolean;
  unavailableReason?: string;
  costPer1kPrompt?: number;
  costPer1kCompletion?: number;
  tags?: string[];
}

export interface ProviderHealth {
  provider: AIProviderType;
  healthy: boolean;
  configured: boolean;
  modelCount: number;
  latencyMs?: number;
  message?: string;
  circuitBreakerStatus: "closed" | "open" | "half-open";
  lastChecked: string;
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface TextContentPart {
  type: "text";
  text: string;
}

export interface ImageContentPart {
  type: "image";
  mimeType: string;
  dataBase64: string;
}

export type ChatMessageContentPart = TextContentPart | ImageContentPart;

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatMessageContentPart[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolFunctionParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: {
      type: "object";
      properties: Record<string, ToolFunctionParameterProperty>;
      required?: string[];
    };
  };
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface NormalizedError {
  code: string;
  message: string;
  retryable: boolean;
  provider?: AIProviderType;
  statusCode?: number;
}

export interface RoutingMetadata {
  taskCategory: TaskCategory;
  selectedReason: string;
  policy: PrivacyPolicy;
  mode: "auto" | "manual";
  fallbackUsed: boolean;
  originalModel?: string;
  attemptedModels?: string[];
  evaluatedCandidatesCount?: number;
}

export interface ChatRequest {
  request_id?: string;
  messages: ChatMessage[];
  model?: string;
  provider?: AIProviderType;
  task_category?: TaskCategory;
  temperature?: number;
  max_tokens?: number;
  tools?: ToolDefinition[];
  policy?: PrivacyPolicy;
  cost_preference?: CostPreference;
  latency_preference?: LatencyPreference;
  stream?: boolean;
}

export interface NormalizedChatResponse {
  request_id: string;
  provider: AIProviderType;
  model: string;
  content: string;
  finish_reason: FinishReason;
  tool_calls?: ToolCall[];
  usage: TokenUsage;
  latency_ms: number;
  error?: NormalizedError | null;
  routing: RoutingMetadata;
}

export interface NormalizedStreamChunk {
  request_id: string;
  provider: AIProviderType;
  model: string;
  delta: string;
  finish_reason?: FinishReason | null;
  tool_calls?: ToolCall[];
  usage?: TokenUsage;
  routing?: RoutingMetadata;
  error?: NormalizedError;
}

export interface ProviderAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeoutMs?: number;
  maxRetries?: number;
  enabled?: boolean;
}

export interface IProviderAdapter {
  readonly provider: AIProviderType;
  readonly isConfigured: boolean;
  readonly config: ProviderAdapterConfig;
  readonly circuitBreaker: CircuitBreaker;

  listModels(): Promise<ModelDefinition[]>;
  getModelInfo(modelId: string): Promise<ModelDefinition | null>;
  chat(request: ChatRequest, signal?: AbortSignal): Promise<NormalizedChatResponse>;
  stream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<NormalizedStreamChunk, void, unknown>;
  healthCheck(): Promise<ProviderHealth>;
}

export interface UserPreferences {
  defaultModel?: string;
  defaultProvider?: AIProviderType;
  routingMode: "auto" | "manual";
  privacyPolicy: PrivacyPolicy;
  costPreference: CostPreference;
  latencyPreference: LatencyPreference;
  fallbackEnabled: boolean;
}

export interface AuditLogRecord {
  requestId: string;
  timestamp: string;
  provider: AIProviderType;
  model: string;
  taskCategory: TaskCategory;
  routingReason: string;
  privacyPolicy: PrivacyPolicy;
  durationMs: number;
  tokens: TokenUsage;
  status: "success" | "error" | "cancelled";
  errorCode?: string;
  fallbackUsed: boolean;
}
