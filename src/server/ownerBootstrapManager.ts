/**
 * VIOLET AI — Phase 3G: Owner Bootstrap Manager
 *
 * Provides backend-controlled single-owner bootstrap lifecycle management.
 * Permanently locks registration once bootstrapped to prevent unauthorized takeovers.
 * Never exposes Supabase secret service keys to the client.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface OwnerBootstrapRecord {
  isBootstrapped: boolean;
  ownerEmail: string | null;
  ownerId: string | null;
  bootstrappedAt: string | null;
  updatedAt: string;
}

export interface OwnerBootstrapStatus {
  isBootstrapped: boolean;
  hasConfiguredOwner: boolean;
  ownerEmail: string | null;
  ownerId: string | null;
  bootstrappedAt: string | null;
}

export class OwnerBootstrapManager {
  private record: OwnerBootstrapRecord;
  private readonly storageFilePath: string;

  constructor(customStoragePath?: string) {
    this.storageFilePath =
      customStoragePath ||
      process.env.VIOLET_BOOTSTRAP_FILE ||
      path.join(process.cwd(), ".violet", "owner_bootstrap.json");

    this.record = {
      isBootstrapped: false,
      ownerEmail: null,
      ownerId: null,
      bootstrappedAt: null,
      updatedAt: new Date().toISOString(),
    };

    this.loadState();
  }

  /**
   * Loads persisted bootstrap state from disk or environment.
   */
  public loadState(): void {
    // 1. Try reading persistent bootstrap file
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<OwnerBootstrapRecord>;
        if (typeof parsed.isBootstrapped === "boolean") {
          this.record = {
            isBootstrapped: parsed.isBootstrapped,
            ownerEmail: parsed.ownerEmail ? parsed.ownerEmail.toLowerCase().trim() : null,
            ownerId: parsed.ownerId || null,
            bootstrappedAt: parsed.bootstrappedAt || null,
            updatedAt: parsed.updatedAt || new Date().toISOString(),
          };
        }
      }
    } catch (err) {
      console.warn("[OwnerBootstrapManager] Failed to read bootstrap file:", err);
    }

    // 2. Fall back to environment configuration if not already bootstrapped from file
    const envOwnerEmail = process.env.VIOLET_OWNER_EMAIL?.trim().toLowerCase();
    const envOwnerId = process.env.VIOLET_OWNER_ID?.trim();
    const envBootstrapped = process.env.VIOLET_BOOTSTRAPPED === "true";

    if (!this.record.isBootstrapped && (envOwnerId || envBootstrapped)) {
      this.record.isBootstrapped = true;
      this.record.ownerEmail = envOwnerEmail || this.record.ownerEmail;
      this.record.ownerId = envOwnerId || this.record.ownerId;
      this.record.bootstrappedAt = this.record.bootstrappedAt || new Date().toISOString();
    } else if (envOwnerEmail && !this.record.ownerEmail) {
      this.record.ownerEmail = envOwnerEmail;
    }
  }

  /**
   * Persists bootstrap state to disk.
   */
  private saveState(): void {
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storageFilePath, JSON.stringify(this.record, null, 2), "utf-8");
    } catch (err) {
      console.error("[OwnerBootstrapManager] Failed to persist bootstrap state:", err);
    }
  }

  /**
   * Returns full owner UUID (internal backend access).
   */
  public getOwnerId(): string | null {
    return this.record.ownerId || process.env.VIOLET_OWNER_ID || null;
  }

  /**
   * Returns full owner email (internal backend access).
   */
  public getOwnerEmail(): string | null {
    return this.record.ownerEmail || process.env.VIOLET_OWNER_EMAIL || null;
  }

  /**
   * Returns current bootstrap status for the frontend.
   */
  public getStatus(): OwnerBootstrapStatus {
    const configuredEmail = (
      process.env.VIOLET_OWNER_EMAIL ||
      this.record.ownerEmail ||
      ""
    ).trim().toLowerCase();

    const configuredId = (process.env.VIOLET_OWNER_ID || this.record.ownerId || "").trim();

    return {
      isBootstrapped: this.record.isBootstrapped,
      hasConfiguredOwner: Boolean(configuredEmail || configuredId),
      ownerEmail: configuredEmail || null,
      ownerId: this.record.ownerId ? `${this.record.ownerId.slice(0, 8)}...` : null,
      bootstrappedAt: this.record.bootstrappedAt,
    };
  }

  /**
   * Performs the one-time owner bootstrap.
   * Permanently disables initial registration.
   */
  public completeBootstrap(params: {
    email: string;
    ownerId: string;
  }): { success: boolean; isBootstrapped: boolean; message: string; record: OwnerBootstrapRecord } {
    if (this.record.isBootstrapped) {
      throw new Error(
        "Owner account has already been bootstrapped. Registration is permanently disabled."
      );
    }

    const cleanEmail = params.email.trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error("Owner email is required.");
    }

    const configuredOwnerEmail = (process.env.VIOLET_OWNER_EMAIL || "").trim().toLowerCase();
    if (configuredOwnerEmail && cleanEmail !== configuredOwnerEmail) {
      throw new Error(
        `Access restricted: Only the configured owner email ('${configuredOwnerEmail}') is permitted to bootstrap VIOLET.`
      );
    }

    const cleanOwnerId = params.ownerId.trim();
    if (!cleanOwnerId) {
      throw new Error("Owner ID is required.");
    }

    const now = new Date().toISOString();
    this.record = {
      isBootstrapped: true,
      ownerEmail: cleanEmail,
      ownerId: cleanOwnerId,
      bootstrappedAt: now,
      updatedAt: now,
    };

    // Propagate into running process environment
    process.env.VIOLET_OWNER_ID = cleanOwnerId;
    process.env.VIOLET_OWNER_EMAIL = cleanEmail;
    process.env.VIOLET_BOOTSTRAPPED = "true";

    this.saveState();

    return {
      success: true,
      isBootstrapped: true,
      message: "VIOLET owner bootstrap completed successfully. Registration is now permanently closed.",
      record: { ...this.record },
    };
  }

  /**
   * Synchronizes a newly verified owner email address with the persistent bootstrap record.
   * Preserves the immutable owner UUID (ownerId) and original bootstrappedAt timestamp.
   */
  public syncOwnerEmail(params: {
    newEmail: string;
    callerSub: string;
  }): {
    success: boolean;
    ownerEmail: string;
    ownerId: string;
    updatedAt: string;
    message: string;
  } {
    if (!this.record.isBootstrapped) {
      throw new Error("Cannot synchronize owner email: System is not yet bootstrapped.");
    }

    const cleanNewEmail = (params.newEmail || "").trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanNewEmail)) {
      throw new Error("Invalid email format for owner synchronization.");
    }

    const cleanCallerSub = (params.callerSub || "").trim();
    if (!cleanCallerSub || cleanCallerSub !== this.record.ownerId) {
      throw new Error(
        `Unauthorized: Only the bootstrapped VIOLET owner (UUID: ${this.record.ownerId}) is permitted to synchronize email address.`
      );
    }

    const previousEmail = this.record.ownerEmail;
    const now = new Date().toISOString();

    this.record.ownerEmail = cleanNewEmail;
    this.record.updatedAt = now;

    // Propagate into running process environment
    process.env.VIOLET_OWNER_EMAIL = cleanNewEmail;

    this.saveState();

    return {
      success: true,
      ownerEmail: cleanNewEmail,
      ownerId: this.record.ownerId!,
      updatedAt: now,
      message: `Owner email updated from '${previousEmail}' to '${cleanNewEmail}' successfully.`,
    };
  }

  /**
   * Validates whether an authenticated JWT payload matches the bootstrapped owner.
   */
  public validateOwner(payload: { email?: string; sub?: string }): {
    authorized: boolean;
    error?: string;
  } {
    const configuredOwnerId = (this.record.ownerId || process.env.VIOLET_OWNER_ID || "").trim();
    const configuredOwnerEmail = (
      this.record.ownerEmail ||
      process.env.VIOLET_OWNER_EMAIL ||
      ""
    ).trim().toLowerCase();

    // If bootstrapped, enforce match against bootstrapped owner credentials
    if (this.record.isBootstrapped) {
      if (configuredOwnerEmail && payload.email) {
        if (payload.email.toLowerCase().trim() !== configuredOwnerEmail) {
          return {
            authorized: false,
            error: `Unauthorized: User email '${payload.email}' does not match configured VIOLET owner email.`,
          };
        }
      }

      if (configuredOwnerId && payload.sub) {
        if (payload.sub !== configuredOwnerId) {
          return {
            authorized: false,
            error: `Unauthorized: User ID '${payload.sub}' does not match configured VIOLET owner ID.`,
          };
        }
      }

      return { authorized: true };
    }

    // If not bootstrapped, check if environment variables enforce an owner
    if (configuredOwnerEmail && payload.email) {
      if (payload.email.toLowerCase().trim() !== configuredOwnerEmail) {
        return {
          authorized: false,
          error: `Unauthorized: User email '${payload.email}' does not match configured VIOLET owner email.`,
        };
      }
    }

    if (configuredOwnerId && payload.sub) {
      if (payload.sub !== configuredOwnerId) {
        return {
          authorized: false,
          error: `Unauthorized: User ID '${payload.sub}' does not match configured VIOLET owner ID.`,
        };
      }
    }

    // Single-user fallback if completely unconfigured
    return { authorized: true };
  }

  /**
   * Resets bootstrap state (strictly for testing).
   */
  public resetForTesting(initial?: Partial<OwnerBootstrapRecord>): void {
    this.record = {
      isBootstrapped: false,
      ownerEmail: null,
      ownerId: null,
      bootstrappedAt: null,
      updatedAt: new Date().toISOString(),
      ...initial,
    };
    try {
      if (fs.existsSync(this.storageFilePath)) {
        fs.unlinkSync(this.storageFilePath);
      }
    } catch {
      // Ignore
    }
  }
}

export const globalOwnerBootstrapManager = new OwnerBootstrapManager();
