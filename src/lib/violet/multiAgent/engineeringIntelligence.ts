/**
 * VIOLET Lab — Phase 3D Engineering Intelligence Engine
 *
 * Performs static analysis, security vulnerability scanning, bug/regression detection,
 * code duplication inspection, test coverage assessment, and architectural recommendations.
 */

import path from "node:path";
import type {
  EngineeringFinding,
  FindingCategory,
  FindingSeverity,
} from "../../../types/multiAgent";
import { isSupabaseConfigured, supabase } from "../../supabase";

export interface CodeAnalysisInput {
  taskId: string;
  runId?: string;
  userId?: string;
  files: Array<{ filePath: string; content: string }>;
  gitDiff?: string;
}

export interface EngineeringAnalysisReport {
  taskId: string;
  findings: EngineeringFinding[];
  summary: {
    criticalBugs: number;
    securityRisks: number;
    missingTests: number;
    codeDuplicates: number;
    architecturalSuggestions: number;
  };
  overallRiskLevel: "low" | "medium" | "high" | "critical";
  executiveSummary: string;
}

export class EngineeringIntelligence {
  private findingsStore = new Map<string, EngineeringFinding[]>(); // taskId -> findings

  /**
   * Analyzes modified files, code content, and Git diffs to detect bugs, regressions,
   * duplicated logic, security vulnerabilities, and missing test coverage.
   */
  async analyzeCode(input: CodeAnalysisInput): Promise<EngineeringAnalysisReport> {
    const findings: EngineeringFinding[] = [];
    const userId = input.userId || "00000000-0000-0000-0000-000000000001";

    const addFinding = (
      category: FindingCategory,
      severity: FindingSeverity,
      title: string,
      description: string,
      filePath?: string,
      lineNumber?: number,
      suggestedRemediation?: string,
      metadata: Record<string, unknown> = {}
    ) => {
      findings.push({
        id: `fnd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        taskId: input.taskId,
        runId: input.runId,
        userId,
        category,
        severity,
        title,
        description,
        filePath,
        lineNumber,
        suggestedRemediation,
        metadata,
        createdAt: new Date().toISOString(),
      });
    };

    // 1. Security Vulnerability Scanning
    const SECRET_PATTERNS = [
      { name: "OpenAI API Key", regex: /sk-[a-zA-Z0-9]{32,}/ },
      { name: "Anthropic API Key", regex: /sk-ant-[a-zA-Z0-9_\-]{32,}/ },
      { name: "Hardcoded Password", regex: /password\s*[:=]\s*["'][^"'\s]{6,}["']/i },
      { name: "Raw Private Key", regex: /-----BEGIN PRIVATE KEY-----/ },
    ];

    for (const file of input.files) {
      const lines = file.content.split("\n");

      // Check secrets
      for (const [lineIdx, line] of lines.entries()) {
        for (const secret of SECRET_PATTERNS) {
          if (secret.regex.test(line)) {
            addFinding(
              "security",
              "critical",
              `Hardcoded ${secret.name} detected`,
              `Potential hardcoded secret discovered on line ${lineIdx + 1} in '${file.filePath}'. Secrets must be read from environment variables.`,
              file.filePath,
              lineIdx + 1,
              "Move secret value to .env and access via process.env"
            );
          }
        }

        // SQL injection risk
        if (
          /SELECT\s+.*FROM.*(?:\$\{|\+.*['"]|['"]\s*\+)/i.test(line) ||
          /SELECT\s+.*\+.*["']/i.test(line)
        ) {
          addFinding(
            "security",
            "critical",
            "Potential SQL Injection Risk",
            `Dynamic string concatenation found in SQL statement on line ${lineIdx + 1} in '${file.filePath}'.`,
            file.filePath,
            lineIdx + 1,
            "Use parameterized SQL queries ($1, $2) or an ORM/query builder."
          );
        }

        // Unsafe path traversal
        if (
          /path\.join\([^)]*req\./i.test(line) ||
          /path\.resolve\([^)]*req\./i.test(line) ||
          /(?:readFile|writeFile|createReadStream|createWriteStream|readFileSync|writeFileSync)\([^)]*(?:\+|req\.|userInput)/i.test(line)
        ) {
          addFinding(
            "security",
            "high",
            "Unsanitized Path Traversal Exposure",
            `File path constructed directly from request parameter on line ${lineIdx + 1} in '${file.filePath}'.`,
            file.filePath,
            lineIdx + 1,
            "Sanitize input paths and assert that the resolved path resides within safe boundary (e.g. using path.resolve and startsWith)."
          );
        }
      }

      // 2. Bug & Potential Regression Detection
      for (const [lineIdx, line] of lines.entries()) {
        const isCodeLine =
          !line.includes("import ") &&
          !line.includes("from ") &&
          !line.includes("require(") &&
          !line.includes("//") &&
          !line.includes("/*");

        // Unhandled division by zero
        if (isCodeLine) {
          const divMatch = line.match(/(?:[a-zA-Z0-9_$)\]]\s*)\/\s*([a-zA-Z0-9_$]+)/);
          if (divMatch && !line.includes(`"${divMatch[1]}"`) && !line.includes(`'${divMatch[1]}'`)) {
            const divisor = divMatch[1];
            if (
              divisor &&
              divisor !== "0" &&
              !divisor.startsWith("100") &&
              !divisor.startsWith("1000") &&
              !divisor.startsWith("10") &&
              !divisor.startsWith("2")
            ) {
              // Check if divisor has check prior
              const hasGuard = lines
                .slice(Math.max(0, lineIdx - 5), lineIdx)
                .some(
                  (prev) =>
                    prev.includes(divisor) &&
                    (prev.includes("=== 0") || prev.includes("<= 0") || prev.includes("!"))
                );
              if (!hasGuard && isNaN(Number(divisor))) {
                addFinding(
                  "bug",
                  "high",
                  `Potential Unchecked Division by Zero: '${divisor}'`,
                  `Variable '${divisor}' is used as divisor on line ${lineIdx + 1} without visible non-zero validation in immediate scope.`,
                  file.filePath,
                  lineIdx + 1,
                  `Add validation: if (${divisor} === 0) throw new Error(...) or handle zero-check.`
                );
              }
            }
          }
        }

        // Floating promise without await or catch
        if (/\b(?:fetch|execFileAsync|fs\.writeFile|fs\.readFile)\s*\(/.test(line) && !line.includes("await") && !line.includes("return") && !line.includes(".then") && !line.includes(".catch") && !line.includes("void ")) {
          addFinding(
            "regression",
            "medium",
            "Floating Asynchronous Promise",
            `Asynchronous operation on line ${lineIdx + 1} in '${file.filePath}' is unhandled and not awaited.`,
            file.filePath,
            lineIdx + 1,
            "Prefix with 'await', 'return', or 'void' to prevent unhandled rejection."
          );
        }
      }
    }

    // 3. Code Duplication Detection
    const functionBodies = new Map<string, { filePath: string; name: string }>();
    for (const file of input.files) {
      const fnMatches = file.content.matchAll(/(?:export\s+)?function\s+([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{([\s\S]*?)\}/g);
      for (const fn of fnMatches) {
        const name = fn[1];
        const normalizedBody = fn[2].replace(/\s+/g, "").slice(0, 150);
        if (normalizedBody.length > 50) {
          if (functionBodies.has(normalizedBody)) {
            const original = functionBodies.get(normalizedBody)!;
            addFinding(
              "duplication",
              "low",
              `Duplicated Function Logic: '${name}'`,
              `Function '${name}' in '${file.filePath}' shares identical body logic with '${original.name}' in '${original.filePath}'.`,
              file.filePath,
              undefined,
              `Refactor shared logic into a common utility function.`
            );
          } else {
            functionBodies.set(normalizedBody, { filePath: file.filePath, name });
          }
        }
      }
    }

    // 4. Missing Test Coverage Assessment
    const sourceFiles = input.files.filter((f) => !f.filePath.includes(".test.") && !f.filePath.includes(".spec."));
    const testFiles = new Set(input.files.filter((f) => f.filePath.includes(".test.") || f.filePath.includes(".spec.")).map((f) => f.filePath));

    for (const src of sourceFiles) {
      const ext = src.filePath.slice(src.filePath.lastIndexOf("."));
      const baseName = src.filePath.slice(0, src.filePath.lastIndexOf("."));
      const expectedTestFile1 = `${baseName}.test${ext}`;
      const expectedTestFile2 = `${baseName}.spec${ext}`;

      const hasMatchingTest = Array.from(testFiles).some(
        (t) => t.includes(path.basename(baseName))
      );

      // Check if file exports functions/classes
      if (src.content.includes("export ") && !hasMatchingTest && !src.filePath.includes("types") && !src.filePath.includes(".d.ts")) {
        addFinding(
          "missing_test",
          "medium",
          `Missing Unit Test Suite for '${path.basename(src.filePath)}'`,
          `Source file '${src.filePath}' exports public interfaces/functions but has no matching unit test in the working tree.`,
          src.filePath,
          undefined,
          `Create unit test '${expectedTestFile1}' or '${expectedTestFile2}' to cover public exports.`
        );
      }
    }

    // 5. Architectural Improvement Suggestions
    for (const file of input.files) {
      const lineCount = file.content.split("\n").length;
      if (lineCount > 600) {
        addFinding(
          "architecture",
          "low",
          `File Exceeds Recommended Length (${lineCount} lines)`,
          `File '${file.filePath}' is ${lineCount} lines long, which may degrade readability and maintainability.`,
          file.filePath,
          undefined,
          "Consider breaking file down into cohesive submodules or separate helper files."
        );
      }
    }

    // Store findings
    this.findingsStore.set(input.taskId, findings);

    // Persist findings to Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        for (const f of findings) {
          await (supabase.from("engineering_findings") as any).insert({
            id: f.id,
            task_id: f.taskId,
            run_id: f.runId || null,
            user_id: f.userId,
            category: f.category,
            severity: f.severity,
            title: f.title,
            description: f.description,
            file_path: f.filePath || null,
            line_number: f.lineNumber || null,
            suggested_remediation: f.suggestedRemediation || null,
            metadata: f.metadata || {},
            created_at: f.createdAt,
          });
        }
      } catch (err) {
        console.warn("Could not persist findings to Supabase:", err);
      }
    }

    const criticalCount = findings.filter((f) => f.severity === "critical").length;
    const highCount = findings.filter((f) => f.severity === "high").length;
    const overallRiskLevel =
      criticalCount > 0 ? "critical" : highCount > 0 ? "high" : findings.length > 5 ? "medium" : "low";

    const summary = {
      criticalBugs: findings.filter((f) => f.category === "bug" && (f.severity === "critical" || f.severity === "high")).length,
      securityRisks: findings.filter((f) => f.category === "security").length,
      missingTests: findings.filter((f) => f.category === "missing_test").length,
      codeDuplicates: findings.filter((f) => f.category === "duplication").length,
      architecturalSuggestions: findings.filter((f) => f.category === "architecture").length,
    };

    const executiveSummary =
      findings.length === 0
        ? `Task ${input.taskId} passed automated engineering static checks with zero defects detected. Overall Risk Level: LOW.`
        : `Engineering Intelligence Analysis for Task ${input.taskId}:
Overall Risk Level: ${overallRiskLevel.toUpperCase()}
Total Findings: ${findings.length} (Critical: ${criticalCount}, High: ${highCount})
- Security Vulnerabilities: ${summary.securityRisks}
- Bugs & Regressions: ${summary.criticalBugs}
- Missing Test Suites: ${summary.missingTests}
- Duplicated Logic: ${summary.codeDuplicates}
- Architectural Suggestions: ${summary.architecturalSuggestions}`;

    return {
      taskId: input.taskId,
      findings,
      summary,
      overallRiskLevel,
      executiveSummary,
    };
  }

  getFindings(taskId: string): EngineeringFinding[] {
    return this.findingsStore.get(taskId) || [];
  }
}

export const globalEngineeringIntelligence = new EngineeringIntelligence();
