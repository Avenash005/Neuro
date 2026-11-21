import { describe, it, expect, beforeEach } from "vitest";
import { EngineeringIntelligence } from "../engineeringIntelligence";

describe("EngineeringIntelligence (Static Analysis & Risk Scanner)", () => {
  let engine: EngineeringIntelligence;

  beforeEach(() => {
    engine = new EngineeringIntelligence();
  });

  it("detects hardcoded secrets and API keys with critical severity", async () => {
    const report = await engine.analyzeCode({
      taskId: "task-sec-1",
      files: [
        {
          filePath: "src/config/keys.ts",
          content: `// Configuration\nconst apiKey = "sk-1234567890abcdef1234567890abcdef";\nexport default apiKey;`,
        },
      ],
    });

    expect(report.summary.securityRisks).toBe(1);
    expect(report.overallRiskLevel).toBe("critical");
    const finding = report.findings.find((f) => f.category === "security");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("critical");
    expect(finding?.title).toContain("Hardcoded");
    expect(finding?.suggestedRemediation).toContain(".env");
  });

  it("detects SQL injection vulnerabilities with raw string concatenation", async () => {
    const report = await engine.analyzeCode({
      taskId: "task-sqli-1",
      files: [
        {
          filePath: "src/db/users.ts",
          content: `export async function getUser(reqId: string) {
  const query = "SELECT * FROM users WHERE id = '" + reqId + "'";
  return db.execute(query);
}`,
        },
      ],
    });

    expect(report.summary.securityRisks).toBeGreaterThanOrEqual(1);
    const sqli = report.findings.find((f) => f.title.includes("SQL Injection"));
    expect(sqli).toBeDefined();
    expect(sqli?.severity).toBe("critical");
    expect(sqli?.suggestedRemediation).toContain("parameterized");
  });

  it("detects path traversal vulnerabilities in file access calls", async () => {
    const report = await engine.analyzeCode({
      taskId: "task-traversal-1",
      files: [
        {
          filePath: "src/server/fileServer.ts",
          content: `import fs from "fs";
export function serveFile(userInput: string) {
  return fs.readFileSync("/data/" + userInput);
}`,
        },
      ],
    });

    const traversal = report.findings.find((f) => f.title.includes("Path Traversal"));
    expect(traversal).toBeDefined();
    expect(traversal?.severity).toBe("high");
    expect(traversal?.suggestedRemediation).toContain("path.resolve");
  });

  it("detects potential bugs such as unhandled division by zero", async () => {
    const report = await engine.analyzeCode({
      taskId: "task-bug-1",
      files: [
        {
          filePath: "src/math/calc.ts",
          content: `export function computeRatio(total: number, count: number) {
  return total / count;
}`,
        },
      ],
    });

    expect(report.summary.criticalBugs).toBeGreaterThanOrEqual(1);
    const bug = report.findings.find((f) => f.title.toLowerCase().includes("division by zero"));
    expect(bug).toBeDefined();
    expect(bug?.suggestedRemediation?.toLowerCase()).toContain("zero");
  });

  it("detects missing test coverage when public functions lack accompanying test files", async () => {
    const report = await engine.analyzeCode({
      taskId: "task-test-gap-1",
      files: [
        {
          filePath: "src/services/billingService.ts",
          content: `export function processPayment(amount: number) {
  return { status: "processed", amount };
}`,
        },
      ],
    });

    expect(report.summary.missingTests).toBe(1);
    const missing = report.findings.find((f) => f.category === "missing_test");
    expect(missing).toBeDefined();
    expect(missing?.title.toLowerCase()).toContain("missing unit test");
    expect(missing?.suggestedRemediation).toContain("billingService.test.ts");
  });

  it("detects duplicated code blocks across multiple files", async () => {
    const duplicateLogic = `// Utility block
const cleanName = name.trim().toLowerCase();
const tokens = cleanName.split("_");
const result = tokens.join("-");
return result;`;

    const report = await engine.analyzeCode({
      taskId: "task-dup-1",
      files: [
        {
          filePath: "src/utils/formatterA.ts",
          content: `export function formatA(name: string) {\n${duplicateLogic}\n}`,
        },
        {
          filePath: "src/utils/formatterB.ts",
          content: `export function formatB(name: string) {\n${duplicateLogic}\n}`,
        },
      ],
    });

    expect(report.summary.codeDuplicates).toBeGreaterThanOrEqual(1);
    const dup = report.findings.find((f) => f.category === "duplication");
    expect(dup).toBeDefined();
    expect(dup?.description).toContain("shares identical body logic");
  });

  it("computes overall risk level and generates executive summary", async () => {
    const cleanReport = await engine.analyzeCode({
      taskId: "task-clean-1",
      files: [
        {
          filePath: "src/utils/helpers.ts",
          content: `// Pure clean helper
export const PI = 3.14159;`,
        },
        {
          filePath: "src/utils/helpers.test.ts",
          content: `// Test for helper
import { PI } from "./helpers";`,
        },
      ],
    });

    expect(cleanReport.overallRiskLevel).toBe("low");
    expect(cleanReport.executiveSummary).toContain("passed automated engineering static checks");
  });
});
