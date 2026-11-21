/**
 * VIOLET Lab — Phase 3D Repository Intelligence
 *
 * Inspects repository structure, builds a searchable codebase symbol index,
 * identifies related files before assigning tasks, and tracks architectural decisions.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type {
  ArchitecturalDecision,
  CodebaseFileSummary,
  CodebaseSymbol,
  RepositoryAnalysis,
} from "../../../types/multiAgent";
import { isSupabaseConfigured, supabase } from "../../supabase";

export class RepositoryIntelligence {
  private fileIndex = new Map<string, CodebaseFileSummary>();
  private symbolIndex = new Map<string, CodebaseSymbol[]>();
  private keywordIndex = new Map<string, Set<string>>(); // keyword -> Set of filePaths
  private decisions = new Map<string, ArchitecturalDecision[]>(); // taskId -> decisions
  private repoAnalysisCache: RepositoryAnalysis | null = null;
  private lastIndexedRoot: string | null = null;

  // Directories and files to exclude from indexing
  private readonly EXCLUDED_DIRS = new Set([
    "node_modules",
    ".git",
    ".violet",
    "dist",
    "build",
    ".venv",
    "venv",
    ".cache",
    "coverage",
    ".pytest_cache",
  ]);

  private readonly SUPPORTED_EXTENSIONS = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".json",
    ".sql",
    ".md",
    ".toml",
    ".yaml",
    ".yml",
  ]);

  /**
   * Automatically inspects repository structure and framework configuration.
   */
  async inspectRepository(repoRoot: string): Promise<RepositoryAnalysis> {
    if (this.repoAnalysisCache && this.repoAnalysisCache.repoRoot === repoRoot) {
      return this.repoAnalysisCache;
    }

    const languages: Record<string, number> = {};
    const keyDependencies: string[] = [];
    const frameworks: string[] = [];
    let totalFiles = 0;

    // Scan package.json if present
    const pkgPath = path.join(repoRoot, "package.json");
    try {
      const rawPkg = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(rawPkg);

      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      for (const dep of Object.keys(allDeps)) {
        keyDependencies.push(dep);
        if (dep.includes("react")) frameworks.push("React");
        if (dep.includes("vite")) frameworks.push("Vite");
        if (dep.includes("vitest")) frameworks.push("Vitest");
        if (dep.includes("fastapi") || dep.includes("uvicorn")) frameworks.push("FastAPI");
        if (dep.includes("supabase")) frameworks.push("Supabase");
        if (dep.includes("tailwindcss")) frameworks.push("TailwindCSS");
      }
    } catch {
      // package.json optional
    }

    // Traverse directory structure
    const traverse = async (currentDir: string, depth = 0) => {
      if (depth > 6) return;
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (this.EXCLUDED_DIRS.has(entry.name)) continue;

          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            await traverse(fullPath, depth + 1);
          } else if (entry.isFile()) {
            totalFiles++;
            const ext = path.extname(entry.name).toLowerCase();
            if (ext) {
              languages[ext] = (languages[ext] || 0) + 1;
            }
          }
        }
      } catch {
        // Skip inaccessible dirs
      }
    };

    await traverse(repoRoot);

    const uniqueFrameworks = Array.from(new Set(frameworks));
    const sortedLanguages = Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const structureOverview = `Repository Root: ${path.basename(repoRoot)}
Total Source Files: ${totalFiles}
Primary Extensions: ${sortedLanguages.map(([ext, count]) => `${ext} (${count})`).join(", ")}
Frameworks & Tooling: ${uniqueFrameworks.join(", ") || "Standard Fullstack/CLI"}
Dependencies Count: ${keyDependencies.length}`;

    const analysis: RepositoryAnalysis = {
      repoRoot,
      totalFiles,
      languages,
      frameworks: uniqueFrameworks,
      keyDependencies: keyDependencies.slice(0, 30),
      structureOverview,
    };

    this.repoAnalysisCache = analysis;
    return analysis;
  }

  /**
   * Scans codebase and builds searchable symbol and keyword index.
   */
  async buildIndex(repoRoot: string): Promise<{ totalIndexedFiles: number; totalSymbols: number }> {
    if (this.lastIndexedRoot === repoRoot && this.fileIndex.size > 0) {
      return { totalIndexedFiles: this.fileIndex.size, totalSymbols: this.symbolIndex.size };
    }

    this.fileIndex.clear();
    this.symbolIndex.clear();
    this.keywordIndex.clear();

    let totalIndexed = 0;
    let totalSymbols = 0;

    const indexFile = async (filePath: string, relativePath: string) => {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        // Limit individual file size to 1 MB for indexing speed
        if (content.length > 1024 * 1024) return;

        const lines = content.split("\n");
        const symbols: string[] = [];
        const dependencies: string[] = [];
        const exports: string[] = [];
        const ext = path.extname(filePath).toLowerCase();

        // 1. Extract exports and symbols
        lines.forEach((line, index) => {
          const trimmed = line.trim();

          // TypeScript/JavaScript exports
          const exportMatch = trimmed.match(/^export\s+(?:default\s+)?(?:async\s+)?(const|function|class|interface|type)\s+([a-zA-Z0-9_$]+)/);
          if (exportMatch) {
            const kind = exportMatch[1] as CodebaseSymbol["kind"];
            const name = exportMatch[2];
            symbols.push(name);
            exports.push(name);

            const symRecord: CodebaseSymbol = {
              name,
              kind,
              filePath: relativePath,
              line: index + 1,
            };

            if (!this.symbolIndex.has(name.toLowerCase())) {
              this.symbolIndex.set(name.toLowerCase(), []);
            }
            this.symbolIndex.get(name.toLowerCase())!.push(symRecord);
            totalSymbols++;
          }

          // Python definitions
          if (ext === ".py") {
            const pyDefMatch = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)/);
            if (pyDefMatch) {
              const name = pyDefMatch[1];
              symbols.push(name);
              const symRecord: CodebaseSymbol = {
                name,
                kind: "function",
                filePath: relativePath,
                line: index + 1,
              };
              if (!this.symbolIndex.has(name.toLowerCase())) {
                this.symbolIndex.set(name.toLowerCase(), []);
              }
              this.symbolIndex.get(name.toLowerCase())!.push(symRecord);
              totalSymbols++;
            }
          }

          // Import references
          const importMatch = trimmed.match(/from\s+['"](.+?)['"]/) || trimmed.match(/import\s+['"](.+?)['"]/);
          if (importMatch) {
            dependencies.push(importMatch[1]);
          }
        });

        // 2. Keyword tokens
        const tokens = content
          .toLowerCase()
          .replace(/[^a-z0-9_\-$]/g, " ")
          .split(/\s+/)
          .filter((t) => t.length >= 3 && t.length <= 40);

        for (const token of tokens) {
          if (!this.keywordIndex.has(token)) {
            this.keywordIndex.set(token, new Set());
          }
          this.keywordIndex.get(token)!.add(relativePath);
        }

        const summary: CodebaseFileSummary = {
          filePath: relativePath,
          language: ext.slice(1) || "text",
          symbols,
          dependencies,
          exports,
        };

        this.fileIndex.set(relativePath, summary);
        totalIndexed++;
      } catch {
        // Skip unreadable files
      }
    };

    const traverse = async (currentDir: string, depth = 0) => {
      if (depth > 6) return;
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (this.EXCLUDED_DIRS.has(entry.name)) continue;

          const fullPath = path.join(currentDir, entry.name);
          const relativePath = path.relative(repoRoot, fullPath).replace(/\\/g, "/");

          if (entry.isDirectory()) {
            await traverse(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (this.SUPPORTED_EXTENSIONS.has(ext)) {
              await indexFile(fullPath, relativePath);
            }
          }
        }
      } catch {
        // Ignore
      }
    };

    await traverse(repoRoot);
    this.lastIndexedRoot = repoRoot;
    return { totalIndexedFiles: totalIndexed, totalSymbols };
  }

  /**
   * Queries codebase symbols by name.
   */
  findSymbols(name: string): CodebaseSymbol[] {
    return this.symbolIndex.get(name.toLowerCase().trim()) || [];
  }

  /**
   * Identifies related files based on a task goal or technical query.
   * Scores files by symbol matches, path keywords, and content token occurrences.
   */
  identifyRelatedFiles(query: string, maxResults = 8): CodebaseFileSummary[] {
    const rawTerms = query
      .toLowerCase()
      .replace(/[^a-z0-9_\-$]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3);

    const scores = new Map<string, number>();

    for (const term of rawTerms) {
      // 1. Symbol matches
      const symbolMatches = this.symbolIndex.get(term);
      if (symbolMatches) {
        for (const sym of symbolMatches) {
          scores.set(sym.filePath, (scores.get(sym.filePath) || 0) + 15);
        }
      }

      // 2. Path name matches
      for (const filePath of this.fileIndex.keys()) {
        if (filePath.toLowerCase().includes(term)) {
          scores.set(filePath, (scores.get(filePath) || 0) + 8);
        }
      }

      // 3. Keyword occurrences
      const filePathsWithKeyword = this.keywordIndex.get(term);
      if (filePathsWithKeyword) {
        for (const filePath of filePathsWithKeyword) {
          scores.set(filePath, (scores.get(filePath) || 0) + 2);
        }
      }
    }

    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxResults);

    return sorted.map(([filePath, score]) => {
      const summary = this.fileIndex.get(filePath)!;
      return {
        ...summary,
        relevanceScore: score,
      };
    });
  }

  /**
   * Records an Architectural Decision Record (ADR) and persists to database.
   */
  async recordDecision(
    taskId: string,
    title: string,
    context: string,
    decision: string,
    consequences: string,
    modelsConsulted: string[] = [],
    userId = "00000000-0000-0000-0000-000000000001"
  ): Promise<ArchitecturalDecision> {
    const record: ArchitecturalDecision = {
      id: `adr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      taskId,
      userId,
      title,
      status: "accepted",
      context,
      decision,
      consequences,
      modelsConsulted,
      createdAt: new Date().toISOString(),
    };

    if (!this.decisions.has(taskId)) {
      this.decisions.set(taskId, []);
    }
    this.decisions.get(taskId)!.push(record);

    if (isSupabaseConfigured && supabase) {
      try {
        await (supabase.from("architectural_decisions") as any).insert({
          id: record.id,
          task_id: record.taskId,
          user_id: record.userId,
          title: record.title,
          status: record.status,
          context: record.context,
          decision: record.decision,
          consequences: record.consequences,
          models_consulted: record.modelsConsulted,
          created_at: record.createdAt,
        });
      } catch (err) {
        console.warn("Could not persist ADR to Supabase:", err);
      }
    }

    return record;
  }

  /**
   * Lists architectural decisions for a specific task.
   */
  listDecisions(taskId: string): ArchitecturalDecision[] {
    return this.decisions.get(taskId) || [];
  }
}

export const globalRepositoryIntelligence = new RepositoryIntelligence();
