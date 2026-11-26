# VIOLET AI — Phase 3A Architecture Specification
## Production Multi-Model Intelligence & Routing Architecture

---

## 1. System Overview & Product Vision

VIOLET AI functions as a Personal AI Operating System. In Phase 3A, VIOLET introduces **Production Multi-Model Intelligence**, unifying local and cloud language and multimodal models under a secure, resilient, and policy-driven gateway.

### High-Level Data Flow

```
+-------------------------------------------------------------------------+
|                               Frontend                                  |
|         (VioletCommandCenter & VioletIntelligencePanel UI)              |
+------------------------------------+------------------------------------+
                                     |
                                     | REST (JSON) / Streaming (SSE)
                                     v
+------------------------------------+------------------------------------+
|                         VIOLET AI API Server                            |
|             (Node / Vite Middleware on /api/v1/* routes)                |
+------------------------------------+------------------------------------+
                                     |
                                     v
+------------------------------------+------------------------------------+
|                            Model Gateway                                |
|           (Orchestrates routing, execution, retries & fallback)         |
+-------------------+--------------------------------+--------------------+
                    |                                |
                    v                                v
+-------------------+----------------+   +-----------+--------------------+
|     Intelligent Model Router       |   |      AIAuditLogger             |
|  - Task Classifier (7 categories)  |   |  - Privacy-preserving logs     |
|  - Policy Enforcement (LOCAL_ONLY) |   |  - Request duration & tokens   |
|  - Multi-Factor Scoring Engine     |   |  - Zero prompt / secret leaks  |
|  - Transparent Explanation Builder |   +--------------------------------+
+-------------------+----------------+
                    |
                    v
+-------------------+-----------------------------------------------------+
|                          Provider Registry                              |
|           (Adapter Lifecycle, Health Checks, Circuit Breakers)          |
+-------+---------------+---------------+-----------------+---------------+
        |               |               |                 |               |
        v               v               v                 v               v
  +-----------+  +-------------+  +-----------+   +---------------+  +-----------+
  |  Ollama   |  | OpenRouter  |  |  OpenAI   |   | Google Gemini |  | Anthropic |
  |  Adapter  |  |   Adapter   |  |  Adapter  |   |    Adapter    |  |  Adapter  |
  +-----+-----+  +------+------+  +-----+-----+   +-------+-------+  +-----+-----+
        |               |               |                 |                |
        | Localhost     | HTTPS         | HTTPS           | HTTPS          | HTTPS
        v               v               v                 v                v
   Local Ollama    OpenRouter      OpenAI API       Gemini API       Anthropic
    (127.0.0.1)       API         (gpt-4o, etc.)   (2.0-flash, etc.) (Claude 3.5/3.7)
```

---

## 2. Core Architectural Components

### 2.1 Unified Model Interface (`IProviderAdapter`)

All providers implement the standardized `IProviderAdapter` contract:

- `listModels(): Promise<ModelDefinition[]>`: Discovers models available from the provider with normalized capabilities.
- `getModelInfo(modelId: string): Promise<ModelDefinition | null>`: Fetches detailed metadata for a specific model.
- `chat(request: ChatRequest, signal?: AbortSignal): Promise<NormalizedChatResponse>`: Executes a non-streaming chat completion.
- `stream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<NormalizedStreamChunk>`: Streams incremental tokens and finish metadata.
- `healthCheck(): Promise<ProviderHealth>`: Probes provider connectivity, latency, and operational health.
- `readonly circuitBreaker: CircuitBreaker`: Maintains failure threshold and isolation state.

### 2.2 Normalized Response Schema

Every model response is normalized into a uniform schema before returning to the frontend:

```typescript
interface NormalizedChatResponse {
  request_id: string;
  provider: "ollama" | "openrouter" | "openai" | "gemini" | "anthropic";
  model: string;
  content: string;
  finish_reason: "stop" | "length" | "tool_calls" | "error" | "cancelled";
  tool_calls?: ToolCall[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  latency_ms: number;
  error?: NormalizedError | null;
  routing: RoutingMetadata;
}
```

### 2.3 Model Capability Metadata

Every registered model advertises capability metadata used by the intelligent router:

- `text: boolean`
- `vision: boolean` (multimodal image understanding)
- `tool_calling: boolean` (function/tool declaration and structured invocation)
- `structured_output: boolean` (strict JSON schema formatting)
- `streaming: boolean` (incremental chunk generation)
- `context_window: number` (token limit, e.g. 8,192 to 2,000,000)
- `local_or_cloud: "local" | "cloud"`

---

## 3. Intelligent Model Router

The `IntelligentModelRouter` dynamically matches user prompts to the most suitable model using intent classification and multi-factor scoring.

### 3.1 Task Categories

1. **`general_chat`**: Conversational, factual Q&A, and casual assistance.
2. **`reasoning`**: Mathematical derivations, deep logic, algorithmic analysis, and complex multi-step deductions.
3. **`coding`**: Code generation, syntax analysis, refactoring, debugging, git operations, and pull requests.
4. **`vision`**: Multimodal desktop screenshot inspection, diagrams, UI verification, and images.
5. **`summarization`**: Distilling long transcripts, notes, articles, and memory briefs.
6. **`desktop_planning`**: Decomposing system goals into OS automation steps (window manipulation, input execution, process management).
7. **`structured_output`**: JSON extraction, schema conformance, and parameter formatting.

### 3.2 Privacy Policy Modes

The router strictly enforces privacy policies at the backend gateway level:

| Policy | Behavior | Egress Guarantee |
|---|---|---|
| **`AUTO`** | Dynamically chooses the best model (local or cloud) based on task category, capabilities, cost, and latency. | Egress allowed if cloud model selected. |
| **`LOCAL_ONLY`** | Strictly routes to local inference (Ollama). Never makes cloud network calls. Fails gracefully if local model is offline. Never falls back to cloud. | **Zero Data Egress**. Stays on `127.0.0.1`. |
| **`CLOUD_ONLY`** | Exclusively routes to configured cloud providers (OpenRouter, OpenAI, Gemini, Anthropic). | Standard cloud routing. |

### 3.3 Transparent Routing Explanation

Every response carries a human-readable explanation string detailing why the model was selected:
> *"Classified task as 'coding'. Enforced privacy policy 'AUTO'. Selected cloud model 'Claude 3.5 Sonnet' on provider 'anthropic' (score: 115). 2 fallback candidates available."*

---

## 4. Reliability, Resilient Fallback & Circuit Breaker

### 4.1 Circuit Breaker Pattern

Each provider adapter is guarded by a `CircuitBreaker`:
- **`closed`**: Normal state. Consecutive successes reset failure counters.
- **`open`**: Tripped when consecutive failures reach threshold (default: 3). Fast-fails requests to prevent hung connections.
- **`half-open`**: Entered after reset cooldown (default: 30s) to probe whether the provider has recovered.

### 4.2 Resilient Fallback Sequence

When a primary model fails (e.g. HTTP 429 rate limit or HTTP 503 overload):
1. The gateway catches the failure and marks the primary candidate.
2. The router evaluates candidate fallbacks.
3. Under `LOCAL_ONLY`, fallbacks are strictly constrained to other local models; cloud models are never contacted.
4. The response metadata flags `fallbackUsed: true` and logs the attempted sequence.

---

## 5. Security & Isolation Architecture

1. **Backend Secret Isolation**: API keys (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`) are read strictly on the backend and are never sent to the browser or exposed via `VITE_*` variables.
2. **Zero-Configuration Operation**: If zero cloud keys are configured, VIOLET operates completely on Ollama local inference.
3. **Structured Audit Logging**: Logs request IDs, timestamps, provider names, model IDs, token usage, and status. Full prompt text, user secrets, and credentials are never persisted in audit trails.
4. **Local Windows Agent Boundary**: The Windows Local Agent (`apps/violet-local-agent`) handles OS-level execution (windows, UIA, mouse/keyboard) and communicates with the backend for model intelligence; it does not duplicate external provider SDKs.
