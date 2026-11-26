import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  Cpu,
  Info,
  Loader2,
  Lock,
  Paperclip,
  Send,
  Settings2,
  Shield,
  Sparkles,
  StopCircle,
  X,
} from "lucide-react";
import { globalVioletAIClient, VioletAIClient } from "../../lib/violet/ai/apiClient";
import type {
  AIProviderType,
  ChatMessage,
  CostPreference,
  LatencyPreference,
  ModelDefinition,
  NormalizedChatResponse,
  PrivacyPolicy,
  ProviderHealth,
} from "../../lib/violet/ai/types";

interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  imageMime?: string;
  imageBase64?: string;
  responseMetadata?: NormalizedChatResponse;
  timestamp: string;
}

export function VioletIntelligencePanel({
  client = globalVioletAIClient,
}: {
  client?: VioletAIClient;
}) {
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [providers, setProviders] = useState<Record<AIProviderType, ProviderHealth> | null>(null);
  const [, setLoadingModels] = useState(true);

  // Preferences & Routing Controls
  const [routingMode, setRoutingMode] = useState<"auto" | "manual">("auto");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [privacyPolicy, setPrivacyPolicy] = useState<PrivacyPolicy>("AUTO");
  const [costPreference, setCostPreference] = useState<CostPreference>("balance");
  const [latencyPreference, setLatencyPreference] = useState<LatencyPreference>("standard");
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<ChatMessageItem[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello! I am VIOLET's Multi-Model Intelligence Gateway. I can intelligently route tasks across local and cloud models, plan desktop actions, write code, analyze images, and reason under strict privacy policies.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeStreamingMessage, setActiveStreamingMessage] = useState("");
  const [attachedImage, setAttachedImage] = useState<{
    url: string;
    mimeType: string;
    base64: string;
  } | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [expandedReasonId, setExpandedReasonId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Load catalog & preferences on mount
  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoadingModels(true);
        const [modelsList, providersMap, userPrefs] = await Promise.all([
          client.getModels().catch(() => []),
          client.getProviders().catch(() => null),
          client.getPreferences().catch(() => null),
        ]);

        if (!active) return;
        setModels(modelsList);
        setProviders(providersMap);

        if (userPrefs) {
          setRoutingMode(userPrefs.routingMode || "auto");
          setPrivacyPolicy(userPrefs.privacyPolicy || "AUTO");
          setCostPreference(userPrefs.costPreference || "balance");
          setLatencyPreference(userPrefs.latencyPreference || "standard");
          setFallbackEnabled(userPrefs.fallbackEnabled ?? true);
        }

        if (modelsList.length > 0 && !selectedModelId) {
          setSelectedModelId(modelsList[0].id);
        }
      } catch (err) {
        console.error("Failed to load AI gateway data:", err);
      } finally {
        if (active) setLoadingModels(false);
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [client]);

  // Handle Privacy Policy Change
  const handlePrivacyPolicyChange = async (policy: PrivacyPolicy) => {
    setPrivacyPolicy(policy);
    try {
      await client.updatePreferences({ privacyPolicy: policy });
    } catch {
      // Preference persist failed
    }
  };

  // Handle Image Upload
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(",")[1];
      setAttachedImage({
        url: URL.createObjectURL(file),
        mimeType: file.type || "image/png",
        base64: base64Data,
      });
    };
    reader.readAsDataURL(file);
  };

  // Send Message with Streaming
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputPrompt).trim();
    if (!query && !attachedImage) return;

    setErrorBanner(null);
    setInputPrompt("");

    const userMsgId = `msg_user_${Date.now()}`;
    const newMessages: ChatMessageItem[] = [
      ...messages,
      {
        id: userMsgId,
        role: "user",
        content: query,
        imageUrl: attachedImage?.url,
        imageMime: attachedImage?.mimeType,
        imageBase64: attachedImage?.base64,
        timestamp: new Date().toLocaleTimeString(),
      },
    ];

    setMessages(newMessages);
    setAttachedImage(null);

    setIsGenerating(true);
    setActiveStreamingMessage("");
    const controller = new AbortController();
    setAbortController(controller);

    // Format chat payload
    const formattedMessages: ChatMessage[] = newMessages.map((m) => {
      if (m.imageBase64 && m.imageMime) {
        return {
          role: m.role,
          content: [
            { type: "text", text: m.content || "Analyze this image" },
            { type: "image", mimeType: m.imageMime, dataBase64: m.imageBase64 },
          ],
        };
      }
      return {
        role: m.role,
        content: m.content,
      };
    });

    const assistantMsgId = `msg_asst_${Date.now()}`;
    let accumulatedContent = "";
    let finalMetadata: NormalizedChatResponse | undefined;

    try {
      const streamGenerator = client.stream(
        {
          messages: formattedMessages,
          policy: privacyPolicy,
          model: routingMode === "manual" ? selectedModelId : undefined,
          cost_preference: costPreference,
          latency_preference: latencyPreference,
        },
        controller.signal
      );

      for await (const chunk of streamGenerator) {
        if (chunk.error) {
          throw new Error(chunk.error.message || "Streaming encountered error");
        }

        if (chunk.delta) {
          accumulatedContent += chunk.delta;
          setActiveStreamingMessage(accumulatedContent);
        }

        if (chunk.routing) {
          finalMetadata = {
            request_id: chunk.request_id,
            provider: chunk.provider,
            model: chunk.model,
            content: accumulatedContent,
            finish_reason: chunk.finish_reason || "stop",
            usage: chunk.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            latency_ms: 0,
            routing: chunk.routing,
          };
        }

        if (chunk.finish_reason === "stop") {
          if (finalMetadata && chunk.usage) {
            finalMetadata.usage = chunk.usage;
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant",
          content: accumulatedContent,
          responseMetadata: finalMetadata,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } catch (err) {
      if (controller.signal.aborted) {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMsgId,
            role: "assistant",
            content: accumulatedContent + "\n\n*(Generation stopped by user)*",
            responseMetadata: finalMetadata,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setErrorBanner(errorMsg);
      }
    } finally {
      setIsGenerating(false);
      setActiveStreamingMessage("");
      setAbortController(null);
    }
  };

  const handleStopGeneration = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 16 }}>
      {/* ── Top Bar: Routing Mode, Policy & Provider Selector ──────────────── */}
      <div
        className="card"
        style={{
          padding: "14px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Privacy Policy Toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--bg-app)",
              padding: 4,
              borderRadius: 8,
              border: "1px solid var(--border-color)",
            }}
          >
            {(["AUTO", "LOCAL_ONLY", "CLOUD_ONLY"] as PrivacyPolicy[]).map((p) => {
              const active = privacyPolicy === p;
              return (
                <button
                  key={p}
                  onClick={() => handlePrivacyPolicyChange(p)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "none",
                    background: active
                      ? p === "LOCAL_ONLY"
                        ? "#10b981"
                        : p === "CLOUD_ONLY"
                        ? "#3b82f6"
                        : "var(--brand)"
                      : "transparent",
                    color: active ? "#fff" : "var(--text-muted)",
                    fontWeight: active ? 600 : 400,
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {p === "LOCAL_ONLY" ? <Lock size={12} /> : p === "CLOUD_ONLY" ? <Cpu size={12} /> : <Shield size={12} />}
                  <span>{p === "LOCAL_ONLY" ? "Local Only (Ollama)" : p === "CLOUD_ONLY" ? "Cloud Only" : "Auto Route"}</span>
                </button>
              );
            })}
          </div>

          {/* Mode Toggle (Auto vs Manual) */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setRoutingMode(routingMode === "auto" ? "manual" : "auto")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 8,
                background: "var(--bg-app)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Sparkles size={14} color="var(--brand)" />
              <span>{routingMode === "auto" ? "Intelligent Routing: ON" : "Manual Model: ON"}</span>
            </button>
          </div>

          {/* Manual Model Selector (shown when in manual mode) */}
          {routingMode === "manual" && (
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                background: "var(--bg-app)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                fontSize: 12,
              }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.capabilities.local_or_cloud === "local" ? "🟢 [Local]" : "☁ [Cloud]"} {m.name} ({m.provider})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Settings Button */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            background: "var(--bg-app)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <Settings2 size={14} />
          <span>Routing & Providers</span>
        </button>
      </div>

      {/* ── Settings Drawer / Panel ────────────────────────────────────────── */}
      {showSettings && (
        <div
          className="card"
          style={{
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Multi-Model Routing Preferences</h3>
            <button
              onClick={() => setShowSettings(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {/* Cost Preference */}
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                Cost Policy
              </label>
              <select
                value={costPreference}
                onChange={(e) => {
                  const val = e.target.value as CostPreference;
                  setCostPreference(val);
                  void client.updatePreferences({ costPreference: val });
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              >
                <option value="minimize_cost">Minimize Cost (prefer local / free / mini)</option>
                <option value="balance">Balanced (optimal intelligence / cost trade-off)</option>
                <option value="max_performance">Max Performance (flagship reasoning)</option>
              </select>
            </div>

            {/* Latency Preference */}
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                Latency Preference
              </label>
              <select
                value={latencyPreference}
                onChange={(e) => {
                  const val = e.target.value as LatencyPreference;
                  setLatencyPreference(val);
                  void client.updatePreferences({ latencyPreference: val });
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              >
                <option value="standard">Standard Latency</option>
                <option value="low_latency">Low Latency (Fast Flash / Haiku)</option>
              </select>
            </div>

            {/* Fallback Resilience Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
              <input
                type="checkbox"
                id="fallbackToggle"
                checked={fallbackEnabled}
                onChange={(e) => {
                  setFallbackEnabled(e.target.checked);
                  void client.updatePreferences({ fallbackEnabled: e.target.checked });
                }}
              />
              <label htmlFor="fallbackToggle" style={{ fontSize: 12, cursor: "pointer" }}>
                Enable Automatic Fallback Sequence (failover to alternate model if primary rate-limits or fails)
              </label>
            </div>
          </div>

          {/* Provider Health Cards */}
          <div>
            <h4 style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Connected Providers & Health</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              {(["ollama", "openrouter", "openai", "gemini", "anthropic"] as AIProviderType[]).map((prov) => {
                const info = providers?.[prov];
                const isHealthy = info?.healthy ?? false;
                const isConfigured = info?.configured ?? false;

                return (
                  <div
                    key={prov}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "var(--bg-app)",
                      border: `1px solid ${isHealthy ? "#10b98133" : "var(--border-color)"}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>{prov}</span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: isHealthy ? "#10b98122" : isConfigured ? "#f59e0b22" : "#64748b22",
                          color: isHealthy ? "#10b981" : isConfigured ? "#f59e0b" : "var(--text-muted)",
                        }}
                      >
                        {isHealthy ? "Healthy" : isConfigured ? "Error" : "No Key"}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {prov === "ollama" ? "Localhost (0 egress)" : isConfigured ? "Configured" : "Not configured in .env"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Error Banner ───────────────────────────────────────────────────── */}
      {errorBanner && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "#ef444422",
            border: "1px solid #ef444466",
            color: "#ef4444",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={16} />
            <span>{errorBanner}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Chat Messages Container ────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          flex: 1,
          padding: 18,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxHeight: "560px",
        }}
      >
        {messages.map((m) => {
          const isUser = m.role === "user";
          const meta = m.responseMetadata;

          return (
            <div
              key={m.id}
              style={{
                alignSelf: isUser ? "flex-end" : "flex-start",
                maxWidth: "85%",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: isUser ? "var(--brand)" : "var(--bg-app)",
                  color: isUser ? "#fff" : "var(--text-primary)",
                  border: isUser ? "none" : "1px solid var(--border-color)",
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {/* Attached Image Preview in User Message */}
                {m.imageUrl && (
                  <div style={{ marginBottom: 10 }}>
                    <img
                      src={m.imageUrl}
                      alt="Attached screenshot or document"
                      style={{ maxWidth: 280, maxHeight: 180, borderRadius: 8, objectFit: "cover" }}
                    />
                  </div>
                )}
                {m.content}
              </div>

              {/* Response Metadata Footer (for Assistant messages) */}
              {meta && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    color: "var(--text-muted)",
                    paddingLeft: 4,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: meta.provider === "ollama" ? "#10b98115" : "#3b82f615",
                      color: meta.provider === "ollama" ? "#10b981" : "#3b82f6",
                      fontWeight: 600,
                    }}
                  >
                    {meta.provider === "ollama" ? "🟢 Local" : "☁ Cloud"} • {meta.model}
                  </span>

                  {meta.routing.fallbackUsed && (
                    <span style={{ color: "#f59e0b", fontWeight: 600 }}>• Fallback Used</span>
                  )}

                  {meta.usage.total_tokens > 0 && <span>• {meta.usage.total_tokens} tokens</span>}

                  {meta.latency_ms > 0 && <span>• {meta.latency_ms}ms</span>}

                  {/* Routing Reason Popover Button */}
                  <button
                    onClick={() => setExpandedReasonId(expandedReasonId === m.id ? null : m.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      padding: 0,
                      textDecoration: "underline",
                    }}
                  >
                    <Info size={11} />
                    <span>Routing reason</span>
                  </button>
                </div>
              )}

              {/* Expanded Routing Explanation */}
              {expandedReasonId === m.id && meta && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    background: "var(--bg-app)",
                    border: "1px solid var(--border-color)",
                    fontSize: 11,
                    color: "var(--text-primary)",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Transparent Router Explanation:</div>
                  <div>{meta.routing.selectedReason}</div>
                  <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
                    Task: {meta.routing.taskCategory} • Policy: {meta.routing.policy} • Mode: {meta.routing.mode}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Live Streaming Indicator */}
        {isGenerating && activeStreamingMessage && (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "85%",
              padding: "12px 16px",
              borderRadius: "16px 16px 16px 4px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              fontSize: 14,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {activeStreamingMessage}
            <span className="cursor-blink" style={{ marginLeft: 4 }}>
              ▍
            </span>
          </div>
        )}

        {isGenerating && !activeStreamingMessage && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 13 }}>
            <Loader2 size={16} className="spin" />
            <span>Intelligent router selecting optimal model...</span>
          </div>
        )}
      </div>

      {/* ── Input Box & Controls ───────────────────────────────────────────── */}
      <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Attached image preview */}
        {attachedImage && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={attachedImage.url}
              alt="Attachment"
              style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover" }}
            />
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Image attached for vision inspection</span>
            <button
              onClick={() => setAttachedImage(null)}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          {/* File attachment input for images */}
          <label
            title="Attach screenshot or image for multimodal vision analysis"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 42,
              height: 42,
              borderRadius: 8,
              background: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            <Paperclip size={18} />
            <input
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: "none" }}
              disabled={isGenerating}
            />
          </label>

          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSendMessage();
              }
            }}
            placeholder="Ask VIOLET anything, request code, or ask to operate Windows..."
            disabled={isGenerating}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 8,
              background: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              fontSize: 14,
            }}
          />

          {isGenerating ? (
            <button
              onClick={handleStopGeneration}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 18px",
                borderRadius: 8,
                background: "#ef4444",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <StopCircle size={16} />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputPrompt.trim() && !attachedImage}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 18px",
                borderRadius: 8,
                background: "var(--brand)",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                fontSize: 13,
                cursor: !inputPrompt.trim() && !attachedImage ? "not-allowed" : "pointer",
              }}
            >
              <Send size={15} />
              <span>Send</span>
            </button>
          )}
        </div>

        {/* Quick Task Prompts */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Try asking:</span>
          {[
            { label: "Refactor function", prompt: "Refactor this TypeScript function for optimal performance", cat: "coding" },
            { label: "Plan desktop task", prompt: "Plan steps to open Notepad, write notes and save to Desktop", cat: "desktop_planning" },
            { label: "Reason logic", prompt: "Solve this algorithmic riddle step by step with proof", cat: "reasoning" },
            { label: "Summarize", prompt: "Summarize the key architectural patterns of multi-model gateways", cat: "summarization" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => handleSendMessage(item.prompt)}
              disabled={isGenerating}
              style={{
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 6,
                background: "var(--bg-app)",
                border: "1px solid var(--border-color)",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
