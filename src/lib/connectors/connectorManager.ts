/**
 * Neuron AI — Connector Manager
 *
 * Manages live connector instances for the current session.
 * Provides the single source of truth for which connectors are active.
 *
 * Usage:
 *   connectorManager.register(new GitHubConnector(connectionId));
 *   connectorManager.get("github");
 *   connectorManager.getAllReady();
 */

import type { SourceConnector } from "../../types/connectors";
import { getProvider, FEATURED_PROVIDER_IDS } from "./providerRegistry";

class ConnectorManager {
  private connectors = new Map<string, SourceConnector>();

  /** Register a connector instance */
  register(connector: SourceConnector): void {
    this.connectors.set(connector.providerId, connector);
  }

  /** Unregister a connector */
  unregister(providerId: string): void {
    this.connectors.delete(providerId);
  }

  /** Get a connector by provider ID */
  get(providerId: string): SourceConnector | undefined {
    return this.connectors.get(providerId);
  }

  /** All registered connectors */
  getAll(): Map<string, SourceConnector> {
    return new Map(this.connectors);
  }

  /** Only connectors that are in a ready state */
  getAllReady(): Map<string, SourceConnector> {
    const ready = new Map<string, SourceConnector>();
    for (const [pid, conn] of this.connectors) {
      if (conn.isReady()) ready.set(pid, conn);
    }
    return ready;
  }

  /** Provider IDs of all registered connectors */
  getProviderIds(): string[] {
    return [...this.connectors.keys()];
  }

  /** Provider IDs of all READY connectors */
  getReadyProviderIds(): string[] {
    return [...this.connectors.entries()]
      .filter(([, c]) => c.isReady())
      .map(([pid]) => pid);
  }

  /** Integration status list for Settings UI */
  getStatusList(): IntegrationStatus[] {
    return FEATURED_PROVIDER_IDS.map((pid: string) => {
      const provider = getProvider(pid);
      const connector = this.connectors.get(pid);
      const meta = connector?.getMetadata();
      const status = connector
        ? connector.isReady() ? "connected" : "error"
        : "disconnected";

      return {
        providerId: pid,
        name: provider.name,
        iconEmoji: provider.iconEmoji,
        category: provider.category,
        status,
        lastSyncAt: meta?.lastSyncAt ?? null,
        itemCount: meta?.itemCount ?? 0,
        capabilities: provider.capabilities,
        authType: provider.authType,
      };
    });
  }
}

export interface IntegrationStatus {
  providerId: string;
  name: string;
  iconEmoji: string;
  category: string;
  status: "connected" | "disconnected" | "error" | "syncing";
  lastSyncAt: string | null;
  itemCount: number;
  capabilities: string[];
  authType: string;
}

/** Singleton connector manager for the current browser session */
export const connectorManager = new ConnectorManager();
