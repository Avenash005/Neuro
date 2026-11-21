# VIOLET AI — Phase 3A Provider Setup Guide
## Multi-Model Intelligence Configuration & Setup

---

## 1. Overview

VIOLET AI supports five provider integrations:
1. **Ollama** (Local inference, 0 data egress, zero cost, completely offline)
2. **OpenRouter** (Aggregated multi-provider catalog)
3. **OpenAI** (Official GPT-4o, GPT-4o mini, o1, o3-mini)
4. **Google Gemini** (Gemini 2.0 Flash, Gemini 1.5 Pro, native multimodal)
5. **Anthropic Claude** (Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku)

You do **not** need every API key. If no cloud API keys are provided, VIOLET runs seamlessly on local Ollama.

---

## 2. Environment Configuration (`.env`)

Add the following variables to your root `.env` file (copied from `.env.example`):

```bash
# ==============================================================================
# VIOLET AI — Multi-Model Intelligence Gateway
# ==============================================================================

# 1. Ollama (Local inference, default: http://127.0.0.1:11434)
OLLAMA_BASE_URL=http://127.0.0.1:11434

# 2. OpenRouter (Optional cloud aggregator)
OPENROUTER_API_KEY=sk-or-v1-...

# 3. OpenAI (Optional cloud provider)
OPENAI_API_KEY=sk-proj-...

# 4. Google Gemini (Optional cloud provider)
GEMINI_API_KEY=AIzaSy...

# 5. Anthropic Claude (Optional cloud provider)
ANTHROPIC_API_KEY=sk-ant-api03-...
```

> **Security Note**: Never prefix secret keys with `VITE_`. VIOLET's backend server loads these variables in a secure Node environment and never exposes credentials to the browser client.

---

## 3. Provider-by-Provider Setup

### 3.1 Ollama (Local Inference)

Ollama runs open-weights models locally on your GPU/CPU with 100% privacy and zero network egress.

1. **Install Ollama**:
   - Download for Windows from [ollama.com/download](https://ollama.com/download).
2. **Start Ollama Service**:
   - Ollama runs in the background at `http://127.0.0.1:11434`.
3. **Download Recommended Models**:
   ```powershell
   # General chat & tool-calling
   ollama pull llama3.1:8b

   # Multimodal vision (for desktop screenshot analysis)
   ollama pull llava:7b

   # High-efficiency coding
   ollama pull qwen2.5-coder:7b
   ```
4. **Verify Health**:
   ```powershell
   curl http://127.0.0.1:11434/api/tags
   ```

### 3.2 OpenRouter

OpenRouter provides access to over 200 models through a single API key.

1. Create an account at [openrouter.ai](https://openrouter.ai).
2. Generate an API key under **Keys**.
3. Add `OPENROUTER_API_KEY=sk-or-...` to your `.env` file.

### 3.3 OpenAI

1. Sign up at [platform.openai.com](https://platform.openai.com).
2. Generate an API key under **API Keys**.
3. Add `OPENAI_API_KEY=sk-proj-...` to your `.env` file.
4. Default model: `gpt-4o`.

### 3.4 Google Gemini

1. Obtain an API key from [Google AI Studio](https://aistudio.google.com).
2. Add `GEMINI_API_KEY=AIzaSy...` to your `.env` file.
3. Default model: `gemini-2.0-flash`.

### 3.5 Anthropic Claude

1. Sign up at [console.anthropic.com](https://console.anthropic.com).
2. Create an API key under **API Keys**.
3. Add `ANTHROPIC_API_KEY=sk-ant-...` to your `.env` file.
4. Default model: `claude-3-5-sonnet-20241022` or `claude-3-7-sonnet-20250219`.

---

## 4. Privacy Policies & Routing Modes

In the VIOLET Command Center (or via API):

- **`AUTO`**: Evaluates task complexity, token requirements, latency, and cost preferences to select either a local or cloud model.
- **`LOCAL_ONLY`**: **Zero Cloud Egress**. All prompts stay on `127.0.0.1`. If Ollama is offline or lacks the required model capabilities (e.g. Vision), VIOLET refuses to call any cloud API and presents an informative notice.
- **`CLOUD_ONLY`**: Restricts routing to configured cloud providers.

---

## 5. Diagnostic & Verification Endpoints

You can verify your multi-model setup using the local API:

```powershell
# 1. Gateway Health Check
curl http://127.0.0.1:5173/api/v1/health

# 2. Inspect Connected Providers & Circuit Breaker Status
curl http://127.0.0.1:5173/api/v1/providers

# 3. List Discovered Models Across All Providers
curl http://127.0.0.1:5173/api/v1/models

# 4. View Recent Observability & Audit Logs
curl http://127.0.0.1:5173/api/v1/audit/logs
```
