import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { RepositoryIntelligence } from "../repositoryIntelligence";

describe("RepositoryIntelligence", () => {
  let tempRepoDir: string;
  let repoIntel: RepositoryIntelligence;

  beforeEach(async () => {
    tempRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), "violet-repo-intel-test-"));
    repoIntel = new RepositoryIntelligence();

    // Create a mock package.json
    const packageJson = {
      name: "mock-violet-app",
      dependencies: {
        react: "^19.0.0",
        vite: "^6.0.0",
        tailwindcss: "^3.4.0",
        "@supabase/supabase-js": "^2.45.0",
      },
      devDependencies: {
        vitest: "^3.0.0",
        typescript: "^5.6.0",
      },
    };
    await fs.writeFile(path.join(tempRepoDir, "package.json"), JSON.stringify(packageJson, null, 2));

    // Create mock source directories and files
    const srcDir = path.join(tempRepoDir, "src");
    const authDir = path.join(srcDir, "auth");
    await fs.mkdir(authDir, { recursive: true });

    await fs.writeFile(
      path.join(authDir, "jwtValidator.ts"),
      `import { verifyToken } from "./crypto";
export interface TokenPayload {
  userId: string;
  role: string;
}
export async function validateOwnerToken(token: string): Promise<boolean> {
  return token.startsWith("owner-");
}
export class TokenAuthenticator {
  constructor(private secret: string) {}
}`
    );

    await fs.writeFile(
      path.join(srcDir, "index.ts"),
      `export * from "./auth/jwtValidator";
export const APP_VERSION = "1.0.0";`
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(tempRepoDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it("inspects repository structure, frameworks, and dependency statistics", async () => {
    const analysis = await repoIntel.inspectRepository(tempRepoDir);

    expect(analysis.repoRoot).toBe(tempRepoDir);
    expect(analysis.totalFiles).toBeGreaterThanOrEqual(3);
    expect(analysis.frameworks).toContain("React");
    expect(analysis.frameworks).toContain("Vite");
    expect(analysis.frameworks).toContain("Vitest");
    expect(analysis.frameworks).toContain("Supabase");
    expect(analysis.languages[".ts"]).toBeGreaterThanOrEqual(2);
    expect(analysis.languages[".json"]).toBe(1);
    expect(analysis.structureOverview).toContain("Total Source Files");
  });

  it("builds a searchable AST-like symbol index for functions, classes, and interfaces", async () => {
    const indexResult = await repoIntel.buildIndex(tempRepoDir);

    expect(indexResult.totalIndexedFiles).toBeGreaterThanOrEqual(2);
    expect(indexResult.totalSymbols).toBeGreaterThanOrEqual(3);

    const validateFn = repoIntel.findSymbols("validateOwnerToken");
    expect(validateFn.length).toBe(1);
    expect(validateFn[0].kind).toBe("function");
    expect(validateFn[0].filePath).toContain("jwtValidator.ts");

    const authClass = repoIntel.findSymbols("TokenAuthenticator");
    expect(authClass.length).toBe(1);
    expect(authClass[0].kind).toBe("class");

    const tokenInterface = repoIntel.findSymbols("TokenPayload");
    expect(tokenInterface.length).toBe(1);
    expect(tokenInterface[0].kind).toBe("interface");
  });

  it("identifies related candidate files based on keywords and symbol queries", async () => {
    await repoIntel.buildIndex(tempRepoDir);

    const related = repoIntel.identifyRelatedFiles("validate owner authentication token jwt", 5);
    expect(related.length).toBeGreaterThan(0);
    expect(related[0].filePath).toContain("jwtValidator.ts");
    expect(related[0].symbols).toContain("validateOwnerToken");
  });

  it("records and retrieves Architectural Decision Records (ADRs)", async () => {
    const adr = await repoIntel.recordDecision(
      "task-adr-101",
      "Strict Single-User Authentication Architecture",
      "Need to prevent unauthorized access to local agent endpoints.",
      "Implement bearer token verification with owner-only role checking.",
      "All unauthorized requests return 401 Unauthorized immediately.",
      ["claude-3-5-sonnet", "gpt-4o"],
      "user-owner-1"
    );

    expect(adr.id).toBeDefined();
    expect(adr.taskId).toBe("task-adr-101");
    expect(adr.status).toBe("accepted");
    expect(adr.modelsConsulted).toEqual(["claude-3-5-sonnet", "gpt-4o"]);

    const list = repoIntel.listDecisions("task-adr-101");
    expect(list.length).toBe(1);
    expect(list[0].title).toBe("Strict Single-User Authentication Architecture");
    expect(list[0].context).toContain("Need to prevent");
  });
});
