/**
 * VIOLET AI — Agent Studio
 *
 * Dedicated studio for authoring, configuring, and tuning AI agent roles,
 * their system prompts, model bindings, assigned skills, and tool capabilities.
 */

import { useState } from "react";
import {
  Check,
  Layers,
  RotateCcw,
  Save,
} from "lucide-react";
import type { AgentRole } from "../../types/multiAgent";

interface AgentProfile {
  id: string;
  name: string;
  role: AgentRole;
  description: string;
  provider: "anthropic" | "openai" | "gemini" | "openrouter" | "ollama";
  model: string;
  temperature: number;
  maxTokens: number;
  executionMode: "auto" | "local" | "cloud";
  systemPrompt: string;
  skills: string[];
  tools: string[];
}

const DEFAULT_PROFILES: AgentProfile[] = [
  {
    id: "lead-architect",
    name: "VIOLET Lead Architect",
    role: "architect",
    description: "Inspects repository structure, identifies related files, and creates structured implementation plans.",
    provider: "anthropic",
    model: "claude-3-5-sonnet",
    temperature: 0.2,
    maxTokens: 4096,
    executionMode: "cloud",
    systemPrompt:
      "You are the Principal Software Architect for VIOLET Lab. Analyze user instructions against repository context and decompose requirements into structured subtasks with clear acceptance criteria.",
    skills: ["architecture_design", "repository_inspection", "task_decomposition", "symbol_indexing"],
    tools: ["read_file", "search_symbols", "list_directory"],
  },
  {
    id: "core-developer",
    name: "VIOLET Core Developer",
    role: "developer",
    description: "Implements software changes within isolated Git worktrees, authors idiomatic code, and creates commits.",
    provider: "anthropic",
    model: "claude-3-5-sonnet",
    temperature: 0.2,
    maxTokens: 8192,
    executionMode: "cloud",
    systemPrompt:
      "You are the Lead Software Developer in VIOLET Lab. Implement precise, well-structured, production-quality code adhering to project architecture and best practices.",
    skills: ["code_implementation", "ast_analysis", "git_worktree", "test_execution"],
    tools: ["read_file", "write_file", "git_commit", "run_test"],
  },
  {
    id: "independent-reviewer",
    name: "VIOLET Independent Reviewer",
    role: "reviewer",
    description: "Performs rigorous cross-model code review against actual Git diffs, executing tests and static analysis.",
    provider: "openai",
    model: "gpt-4o",
    temperature: 0.1,
    maxTokens: 4096,
    executionMode: "cloud",
    systemPrompt:
      "You are an Independent Senior Software Reviewer. Review unified Git diffs strictly for correctness, security vulnerabilities, regression risks, and test coverage.",
    skills: ["diff_analysis", "code_review", "security_audit", "test_verification"],
    tools: ["git_diff", "read_file", "run_test"],
  },
  {
    id: "orchestrator",
    name: "VIOLET Orchestrator",
    role: "orchestrator",
    description: "Manages concurrency semaphore, schedules subtasks, tracks heartbeats, and guards file conflicts.",
    provider: "anthropic",
    model: "claude-3-5-sonnet",
    temperature: 0.1,
    maxTokens: 2048,
    executionMode: "cloud",
    systemPrompt:
      "You are the VIOLET Orchestrator agent overseeing multi-agent task execution and state machine transitions.",
    skills: ["agent_coordination", "conflict_guard", "task_scheduling", "heartbeat_monitor"],
    tools: ["git_worktree", "agent_message", "task_semaphore"],
  },
];

const AVAILABLE_SKILLS = [
  "architecture_design",
  "repository_inspection",
  "task_decomposition",
  "symbol_indexing",
  "code_implementation",
  "ast_analysis",
  "git_worktree",
  "test_execution",
  "diff_analysis",
  "code_review",
  "security_audit",
  "test_verification",
  "agent_coordination",
  "conflict_guard",
  "task_scheduling",
  "heartbeat_monitor",
];

const AVAILABLE_TOOLS = [
  "read_file",
  "write_file",
  "git_commit",
  "git_diff",
  "run_test",
  "search_symbols",
  "list_directory",
  "git_worktree",
  "agent_message",
];

export function VioletAgentStudio() {
  const [profiles, setProfiles] = useState<AgentProfile[]>(DEFAULT_PROFILES);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("lead-architect");
  const [savedNotification, setSavedNotification] = useState(false);

  const currentProfile = profiles.find((p) => p.id === selectedProfileId) || profiles[0];

  const handleUpdateCurrentProfile = (updates: Partial<AgentProfile>) => {
    setProfiles((prev) =>
      prev.map((p) => (p.id === currentProfile.id ? { ...p, ...updates } : p))
    );
  };

  const handleToggleSkill = (skill: string) => {
    const exists = currentProfile.skills.includes(skill);
    const updated = exists
      ? currentProfile.skills.filter((s) => s !== skill)
      : [...currentProfile.skills, skill];
    handleUpdateCurrentProfile({ skills: updated });
  };

  const handleToggleTool = (tool: string) => {
    const exists = currentProfile.tools.includes(tool);
    const updated = exists
      ? currentProfile.tools.filter((t) => t !== tool)
      : [...currentProfile.tools, tool];
    handleUpdateCurrentProfile({ tools: updated });
  };

  const handleSave = () => {
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 2500);
  };

  const handleResetDefaults = () => {
    const defaultProfile = DEFAULT_PROFILES.find((p) => p.id === currentProfile.id);
    if (defaultProfile) {
      handleUpdateCurrentProfile(defaultProfile);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <Layers size={22} className="text-brand" />
          <span>Agent Studio</span>
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
          Customize AI agent roles, system prompt directives, temperature, skill assignments, and tool permissions.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20 }}>
        {/* Left: Role Navigation */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", padding: "4px 6px" }}>
            Agent Roles
          </span>
          {profiles.map((p) => {
            const isSelected = p.id === currentProfile.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedProfileId(p.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: isSelected ? "1px solid var(--brand)" : "1px solid transparent",
                  background: isSelected ? "rgba(99, 102, 241, 0.1)" : "transparent",
                  color: isSelected ? "var(--brand)" : "var(--text-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {p.provider} • {p.model}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: Agent Config Editor */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Agent Title & Provider Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                Agent Display Name
              </label>
              <input
                type="text"
                value={currentProfile.name}
                onChange={(e) => handleUpdateCurrentProfile({ name: e.target.value })}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "rgba(0,0,0,0.2)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                Provider
              </label>
              <select
                value={currentProfile.provider}
                onChange={(e) => handleUpdateCurrentProfile({ provider: e.target.value as any })}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "rgba(0,0,0,0.2)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              >
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai">OpenAI GPT</option>
                <option value="gemini">Google Gemini</option>
                <option value="openrouter">OpenRouter</option>
                <option value="ollama">Ollama (Local Private)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                Model Identifier
              </label>
              <input
                type="text"
                value={currentProfile.model}
                onChange={(e) => handleUpdateCurrentProfile({ model: e.target.value })}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "rgba(0,0,0,0.2)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              />
            </div>
          </div>

          {/* Hyperparameters */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                  Temperature: {currentProfile.temperature}
                </label>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {currentProfile.temperature <= 0.2 ? "Deterministic (Precise Code)" : "Creative"}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={currentProfile.temperature}
                onChange={(e) => handleUpdateCurrentProfile({ temperature: parseFloat(e.target.value) })}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                  Max Output Tokens: {currentProfile.maxTokens}
                </label>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Response Token Cap</span>
              </div>
              <input
                type="range"
                min="1024"
                max="16384"
                step="512"
                value={currentProfile.maxTokens}
                onChange={(e) => handleUpdateCurrentProfile({ maxTokens: parseInt(e.target.value, 10) })}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
              System Prompt & Behavioral Directives
            </label>
            <textarea
              rows={4}
              value={currentProfile.systemPrompt}
              onChange={(e) => handleUpdateCurrentProfile({ systemPrompt: e.target.value })}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "rgba(0,0,0,0.2)",
                color: "var(--text-primary)",
                fontSize: 12,
                fontFamily: "monospace",
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Assigned Skills */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
              Assigned Skills ({currentProfile.skills.length} active)
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {AVAILABLE_SKILLS.map((skill) => {
                const isActive = currentProfile.skills.includes(skill);
                return (
                  <button
                    key={skill}
                    onClick={() => handleToggleSkill(skill)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      fontSize: 11,
                      border: isActive ? "1px solid var(--brand)" : "1px solid var(--border-color)",
                      background: isActive ? "rgba(99, 102, 241, 0.15)" : "transparent",
                      color: isActive ? "#818cf8" : "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {isActive && <Check size={12} />}
                    <span>{skill}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Allowed Tools */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
              Allowed Tool Capabilities ({currentProfile.tools.length} granted)
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {AVAILABLE_TOOLS.map((tool) => {
                const isGranted = currentProfile.tools.includes(tool);
                return (
                  <button
                    key={tool}
                    onClick={() => handleToggleTool(tool)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      fontSize: 11,
                      border: isGranted ? "1px solid #10b981" : "1px solid var(--border-color)",
                      background: isGranted ? "rgba(16, 185, 129, 0.15)" : "transparent",
                      color: isGranted ? "#10b981" : "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {isGranted && <Check size={12} />}
                    <span>{tool}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid var(--border-color)",
              paddingTop: 14,
            }}
          >
            <button
              onClick={handleResetDefaults}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "transparent",
                color: "var(--text-muted)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <RotateCcw size={14} /> Reset Defaults
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {savedNotification && (
                <span style={{ fontSize: 12, color: "#10b981", display: "flex", alignItems: "center", gap: 4 }}>
                  <Check size={14} /> Profile configured successfully
                </span>
              )}
              <button
                onClick={handleSave}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "var(--brand)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Save size={14} /> Save Configuration
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
