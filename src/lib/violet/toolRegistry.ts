import type { VioletToolManifest } from "../../types/violet";

export class VioletToolRegistry {
  private readonly tools = new Map<string, VioletToolManifest>();

  register(manifest: VioletToolManifest): void {
    if (!manifest.name.trim()) throw new Error("Tool name is required");
    if (!manifest.version.trim()) throw new Error("Tool version is required");
    if (!Number.isInteger(manifest.timeoutMs) || manifest.timeoutMs <= 0) {
      throw new Error("Tool timeoutMs must be a positive integer");
    }
    if (this.tools.has(manifest.name)) {
      throw new Error(`Tool already registered: ${manifest.name}`);
    }
    this.tools.set(manifest.name, Object.freeze({ ...manifest }));
  }

  get(name: string): VioletToolManifest | undefined {
    return this.tools.get(name);
  }

  list(): VioletToolManifest[] {
    return [...this.tools.values()];
  }

  listAvailable(grantedScopes: string[]): VioletToolManifest[] {
    const scopes = new Set(grantedScopes);
    return this.list().filter((tool) =>
      tool.enabled && tool.requiredScopes.every((scope) => scopes.has(scope))
    );
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }
}
