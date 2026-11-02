/**
 * Neuron AI — Integrations Hub
 *
 * Replaces the basic integrations tab in Settings with a full-featured
 * integration management page.
 *
 * Features:
 * - Browse all providers by category
 * - Connect / disconnect with OAuth flow
 * - Sync status with last-sync time and item counts
 * - Permission transparency (what Neuron can/cannot do)
 * - Sync now button
 */

import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  Zap,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { useState, useEffect } from "react";
import { connectorManager, type IntegrationStatus } from "../../lib/connectors/connectorManager";
import { PROVIDERS, FEATURED_PROVIDER_IDS } from "../../lib/connectors/providerRegistry";
import { GitHubConnector } from "../../lib/connectors/githubConnector";
import { GoogleDriveConnector } from "../../lib/connectors/googleDriveConnector";
import { NotionConnector } from "../../lib/connectors/notionConnector";
import { SlackConnector } from "../../lib/connectors/slackConnector";
import { NeuronMemoryConnector } from "../../lib/connectors/neuronMemoryConnector";
import type { MemoryRecord } from "../../lib/supabase";
import type { IntegrationProvider } from "../../types/connectors";

// ─── Props ────────────────────────────────────────────────────────────────

type IntegrationsHubProps = {
  memories: MemoryRecord[];
};

// ─── Category Labels ──────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  local: "Local",
  notes: "Notes & Wikis",
  code: "Code & Dev",
  storage: "Cloud Storage",
  messaging: "Messaging",
  project: "Project Management",
  design: "Design",
  calendar: "Calendar",
  mail: "Mail",
  custom: "Custom",
};

// ─── Provider Card ────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  status,
  onConnect,
  onDisconnect,
  onSync,
  syncing,
}: {
  provider: IntegrationProvider;
  status: IntegrationStatus | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  syncing: boolean;
}) {
  const [showPerms, setShowPerms] = useState(false);
  const isConnected = status?.status === "connected";
  const hasError = status?.status === "error";

  function formatSyncTime(iso: string | null): string {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${isConnected ? "var(--success)" : hasError ? "var(--error)" : "var(--border-color)"}`,
        borderRadius: "var(--radius-md)",
        padding: "16px",
        transition: "var(--transition-fast)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "var(--bg-app)",
            border: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {provider.iconEmoji}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-main)" }}>
              {provider.name}
            </span>
            {isConnected && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: "var(--success)",
                  background: "var(--success-soft)",
                  padding: "1px 6px",
                  borderRadius: 10,
                }}
              >
                CONNECTED
              </span>
            )}
            {hasError && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--error)",
                  background: "var(--error-soft)",
                  padding: "1px 6px",
                  borderRadius: 10,
                }}
              >
                ERROR
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {provider.description}
          </p>
          {isConnected && status && (
            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
              {status.itemCount.toLocaleString()} items · Last synced: {formatSyncTime(status.lastSyncAt)}
            </p>
          )}
        </div>
      </div>

      {/* Permissions */}
      <button
        onClick={() => setShowPerms((p) => !p)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: 11,
          padding: "0 0 8px",
        }}
      >
        <Shield size={11} />
        Permissions
        {showPerms ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      <AnimatePresence>
        {showPerms && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden", marginBottom: 10 }}
          >
            <div
              style={{
                padding: "10px 12px",
                background: "var(--bg-app)",
                borderRadius: "var(--radius-sm)",
                fontSize: 11,
              }}
            >
              <div style={{ marginBottom: 6 }}>
                {provider.permissionsGranted.map((p) => (
                  <div key={p} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 3, color: "var(--success)" }}>
                    <CheckCircle2 size={11} style={{ marginTop: 1, flexShrink: 0 }} />
                    <span style={{ color: "var(--text-muted)" }}>{p}</span>
                  </div>
                ))}
              </div>
              {provider.permissionsDenied.length > 0 && (
                <div>
                  {provider.permissionsDenied.map((p) => (
                    <div key={p} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 3 }}>
                      <AlertCircle size={11} style={{ marginTop: 1, color: "var(--error)", flexShrink: 0 }} />
                      <span style={{ color: "var(--text-muted)" }}>{p}</span>
                    </div>
                  ))}
                </div>
              )}
              {provider.docsUrl && (
                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--brand)", marginTop: 8 }}
                >
                  <ExternalLink size={9} />
                  OAuth documentation
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6 }}>
        {isConnected && (
          <button
            onClick={onSync}
            disabled={syncing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 12px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            <RefreshCw size={11} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
            Sync Now
          </button>
        )}
        <button
          onClick={isConnected ? onDisconnect : onConnect}
          style={{
            flex: isConnected ? 0 : 1,
            padding: "6px 12px",
            background: isConnected ? "var(--error-soft)" : "var(--brand)",
            color: isConnected ? "var(--error)" : "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {isConnected ? "Disconnect" : "Connect"}
        </button>
      </div>
    </div>
  );
}

// ─── OAuth Connect Modal ──────────────────────────────────────────────────

function OAuthModal({
  provider,
  onConnect,
  onClose,
}: {
  provider: IntegrationProvider;
  onConnect: (credentials: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!tokenInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      onConnect({ access_token: tokenInput.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 400,
          background: "var(--bg-card)",
          borderRadius: "var(--radius-lg)",
          padding: "24px",
          border: "1px solid var(--border-color)",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>{provider.iconEmoji}</div>
        <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-main)", marginBottom: 4 }}>
          Connect {provider.name}
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          {provider.description}
        </p>

        <div
          style={{
            padding: "10px 12px",
            background: "var(--bg-app)",
            borderRadius: "var(--radius-sm)",
            marginBottom: 14,
            fontSize: 11,
          }}
        >
          <div style={{ fontWeight: 600, color: "var(--text-main)", marginBottom: 6 }}>
            Neuron will be able to:
          </div>
          {provider.permissionsGranted.map((p) => (
            <div key={p} style={{ display: "flex", gap: 6, marginBottom: 3, color: "var(--success)" }}>
              <CheckCircle2 size={11} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: "var(--text-muted)" }}>{p}</span>
            </div>
          ))}
          <div style={{ fontWeight: 600, color: "var(--text-main)", marginTop: 8, marginBottom: 6 }}>
            Neuron will NOT:
          </div>
          {provider.permissionsDenied.map((p) => (
            <div key={p} style={{ display: "flex", gap: 6, marginBottom: 3 }}>
              <AlertCircle size={11} style={{ flexShrink: 0, marginTop: 1, color: "var(--error)" }} />
              <span style={{ color: "var(--text-muted)" }}>{p}</span>
            </div>
          ))}
        </div>

        {provider.authType === "oauth2" ? (
          <div>
            <div
              style={{
                padding: "10px 12px",
                background: "var(--brand-soft)",
                borderRadius: "var(--radius-sm)",
                fontSize: 11,
                color: "var(--brand)",
                marginBottom: 12,
                display: "flex",
                gap: 6,
              }}
            >
              <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              In production, clicking Connect opens the {provider.name} OAuth authorization page.
              For development, paste a personal access token below.
            </div>
            <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
              Access Token / PAT
            </label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={`Paste your ${provider.name} token…`}
              style={{
                width: "100%",
                padding: "9px 12px",
                background: "var(--bg-app)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-main)",
                fontSize: 12,
                fontFamily: "monospace",
                marginBottom: 12,
                boxSizing: "border-box",
              }}
            />
          </div>
        ) : (
          <div style={{ height: 12 }} />
        )}

        {error && (
          <p style={{ fontSize: 11, color: "var(--error)", marginBottom: 10 }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => void handleConnect()}
            disabled={loading || (provider.authType === "oauth2" && !tokenInput.trim())}
            style={{
              flex: 1,
              padding: "9px",
              background: "var(--brand)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Connecting…" : `Connect ${provider.name}`}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "9px 16px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 12,
            }}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Integrations Hub ────────────────────────────────────────────────

export function IntegrationsHub({ memories }: IntegrationsHubProps) {
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [connectingProvider, setConnectingProvider] = useState<IntegrationProvider | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const refreshStatuses = () => {
    // Ensure Neuron memories connector is always registered
    if (!connectorManager.get("neuron")) {
      connectorManager.register(new NeuronMemoryConnector("neuron-local", memories));
    }
    setStatuses(connectorManager.getStatusList());
  };

  useEffect(() => {
    refreshStatuses();
  }, [memories]);

  const handleConnect = async (provider: IntegrationProvider, credentials: Record<string, string>) => {
    try {
      let connector;
      switch (provider.id) {
        case "github": connector = new GitHubConnector(`${provider.id}-${Date.now()}`); break;
        case "google_drive": connector = new GoogleDriveConnector(`${provider.id}-${Date.now()}`); break;
        case "notion": connector = new NotionConnector(`${provider.id}-${Date.now()}`); break;
        case "slack": connector = new SlackConnector(`${provider.id}-${Date.now()}`); break;
        default:
          showToast(`${provider.name} connector not yet implemented`);
          setConnectingProvider(null);
          return;
      }
      await connector.authenticate(credentials);
      connectorManager.register(connector);
      setConnectingProvider(null);
      refreshStatuses();
      showToast(`${provider.name} connected successfully`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Connection failed");
      setConnectingProvider(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    const connector = connectorManager.get(providerId);
    if (connector) await connector.disconnect();
    connectorManager.unregister(providerId);
    refreshStatuses();
    showToast(`${PROVIDERS[providerId]?.name ?? providerId} disconnected`);
  };

  const handleSync = async (providerId: string) => {
    const connector = connectorManager.get(providerId);
    if (!connector?.isReady()) return;
    setSyncingId(providerId);
    try {
      const result = await connector.sync();
      showToast(`Sync complete — ${result.newItems} new, ${result.modifiedItems} modified`);
      refreshStatuses();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  const categories = [...new Set(
    Object.values(PROVIDERS).map((p) => p.category)
  )].filter((c) => c !== "local");

  const allStatuses = new Map(statuses.map((s) => [s.providerId, s]));

  const filteredProviders = FEATURED_PROVIDER_IDS
    .map((id) => PROVIDERS[id])
    .filter((p) => p && (!categoryFilter || p.category === categoryFilter));

  return (
    <div
      style={{
        padding: "28px 32px",
        fontFamily: "var(--font-sans)",
        maxWidth: 900,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-main)", marginBottom: 4 }}>
          Connected Integrations
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Connect your tools so Neuron can search across your entire knowledge base.
          Neuron requests read-only access and never modifies your data.
        </p>
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        <button
          onClick={() => setCategoryFilter(null)}
          style={{
            padding: "4px 12px",
            borderRadius: 20,
            border: `1px solid ${!categoryFilter ? "var(--brand)" : "var(--border-color)"}`,
            background: !categoryFilter ? "var(--brand-soft)" : "transparent",
            color: !categoryFilter ? "var(--brand)" : "var(--text-muted)",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              border: `1px solid ${categoryFilter === cat ? "var(--brand)" : "var(--border-color)"}`,
              background: categoryFilter === cat ? "var(--brand-soft)" : "transparent",
              color: categoryFilter === cat ? "var(--brand)" : "var(--text-muted)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Provider grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        {filteredProviders.filter(Boolean).map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            status={allStatuses.get(provider.id) ?? null}
            onConnect={() => {
              if (provider.authType === "local" || provider.authType === "none") {
                void handleConnect(provider, {});
              } else {
                setConnectingProvider(provider);
              }
            }}
            onDisconnect={() => void handleDisconnect(provider.id)}
            onSync={() => void handleSync(provider.id)}
            syncing={syncingId === provider.id}
          />
        ))}
      </div>

      {/* OAuth Connect Modal */}
      {connectingProvider && (
        <OAuthModal
          provider={connectingProvider}
          onConnect={(creds) => void handleConnect(connectingProvider, creds)}
          onClose={() => setConnectingProvider(null)}
        />
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              padding: "10px 16px",
              background: "var(--text-main)",
              color: "var(--bg-card)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              fontWeight: 500,
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Zap size={13} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
