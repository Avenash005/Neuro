import {
  Activity,
  Bot,
  Brain,
  CheckCircle2,
  Code2,
  FolderOpen,
  Globe,
  MessageSquare,
  Monitor,
  ShoppingBag,
  Workflow,
} from "lucide-react";

const modules = [
  { title: "Computer agent", detail: "Windows files, screen, apps and approved commands", icon: Monitor, phase: "Local agent foundation" },
  { title: "Browser agent", detail: "Visible Playwright sessions with human takeover", icon: Globe, phase: "Planned" },
  { title: "Developer agent", detail: "Repository inspection, tests, branches and pull requests", icon: Code2, phase: "Planned" },
  { title: "Communication", detail: "Provider-approved inbox access and draft-first replies", icon: MessageSquare, phase: "Planned" },
  { title: "Shopping", detail: "Catalog search, landed-price comparison and checkout approval", icon: ShoppingBag, phase: "Planned" },
  { title: "Memory", detail: "Reuse Neuro's existing memories, retrieval and knowledge graph", icon: Brain, phase: "Existing Neuro foundation" },
  { title: "Workflows", detail: "Schedules, triggers, bounded retries and reusable skills", icon: Workflow, phase: "Planned" },
  { title: "Activity & safety", detail: "Task timeline, approvals, handoffs and audit evidence", icon: Activity, phase: "Foundation contracts added" },
];

export function VioletCommandCenter() {
  return (
    <main className="main-content">
      <section className="welcome">
        <div className="eyebrow"><span /> VIOLET OPERATING SYSTEM</div>
        <h1>VIOLET Command Center</h1>
        <p>One orchestrator for your knowledge, computer, browser and connected services.</p>
      </section>

      <section className="dashboard-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <article className="card" style={{ padding: 22, gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, display: "grid", placeItems: "center", background: "var(--brand-soft)", color: "var(--brand)" }}>
              <Bot size={25} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Operating system foundation</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>Architecture and local agent package are now tracked in this repository on a dedicated feature branch.</p>
            </div>
            <span style={{ fontSize: 12, padding: "6px 10px", borderRadius: 999, background: "var(--warning-soft)", color: "var(--warning)" }}>Local device not paired</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
            <div style={{ flex: 1, minWidth: 170, padding: 14, borderRadius: 12, background: "var(--bg-app)", border: "1px solid var(--border-color)" }}>
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Orchestrator</div>
              <strong style={{ display: "block", marginTop: 5 }}>Architecture defined</strong>
            </div>
            <div style={{ flex: 1, minWidth: 170, padding: 14, borderRadius: 12, background: "var(--bg-app)", border: "1px solid var(--border-color)" }}>
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Windows agent</div>
              <strong style={{ display: "block", marginTop: 5 }}>Starter package added</strong>
            </div>
            <div style={{ flex: 1, minWidth: 170, padding: 14, borderRadius: 12, background: "var(--bg-app)", border: "1px solid var(--border-color)" }}>
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Approval policy</div>
              <strong style={{ display: "block", marginTop: 5 }}>Contracts and tests added</strong>
            </div>
          </div>
        </article>

        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <article className="card" key={module.title} style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--brand-soft)", color: "var(--brand)" }}>
                  <Icon size={20} />
                </div>
                <span style={{ fontSize: 10, padding: "5px 8px", borderRadius: 999, background: "var(--bg-app)", border: "1px solid var(--border-color)", color: "var(--text-muted)" }}>{module.phase}</span>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 650, marginTop: 15 }}>{module.title}</h3>
              <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6, marginTop: 6 }}>{module.detail}</p>
            </article>
          );
        })}
      </section>

      <article className="card" style={{ padding: 22, marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <CheckCircle2 size={18} color="var(--success)" />
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Safety model</h2>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.7 }}>
          VIOLET uses least-privilege tools, approved local folders, named command allowlists and explicit approval for external side effects. Browser verification challenges such as CAPTCHA, OTP and MFA pause for you to complete manually. This dashboard does not claim that integrations or device pairing are already connected.
        </p>
      </article>

      <article className="card" style={{ padding: 22, marginTop: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Implementation documents</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.7 }}>
          See docs/VIOLET_PRODUCT_ARCHITECTURE.md for the target design and docs/VIOLET_IMPLEMENTATION_BACKLOG.md for the phased implementation checklist. The Windows agent lives in apps/violet-local-agent.
        </p>
      </article>
    </main>
  );
}
