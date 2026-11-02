/**
 * Neuron AI — Source Router
 *
 * Analyses a natural-language query and determines which connectors to search.
 *
 * Strategy:
 *  1. Explicit mention → route primarily to named source
 *  2. Type hint (e.g. "commit", "issue") → infer likely provider
 *  3. No constraint → search all connected providers
 *
 * Designed to be extensible: add new hint matchers without touching the engine.
 */

import type {
  RetrievalQuery,
  SourceRoute,
  KnowledgeSourceType,
} from "../../types/connectors";

// ─── Explicit Source Aliases ──────────────────────────────────────────────

/** Maps phrases the user might say to provider IDs */
const EXPLICIT_SOURCE_ALIASES: Record<string, string> = {
  // GitHub
  "github": "github",
  "git hub": "github",
  "repository": "github",
  "repo": "github",
  // Google Drive
  "google drive": "google_drive",
  "gdrive": "google_drive",
  "drive": "google_drive",
  // Notion
  "notion": "notion",
  // Slack
  "slack": "slack",
  // Local
  "local": "local",
  "local files": "local",
  "my computer": "local",
  "my machine": "local",
  "folder": "local",
  // Neuron
  "neuron": "neuron",
  "memories": "neuron",
  "memory": "neuron",
  // Dropbox
  "dropbox": "dropbox",
  // OneDrive
  "onedrive": "onedrive",
  "one drive": "onedrive",
};

// ─── Type Hints ──────────────────────────────────────────────────────────

interface TypeHint {
  keywords: string[];
  providerIds: string[];
  sourceTypes: KnowledgeSourceType[];
}

const TYPE_HINTS: TypeHint[] = [
  {
    keywords: ["commit", "branch", "pull request", "pr", "merge", "diff", "push", "issue", "bug report", "code review"],
    providerIds: ["github"],
    sourceTypes: ["commit", "pull_request", "issue", "repository_file"],
  },
  {
    keywords: ["repository", "repo", "source code", "codebase", "implementation"],
    providerIds: ["github"],
    sourceTypes: ["repository_file", "repository_readme"],
  },
  {
    keywords: ["document", "doc", "spreadsheet", "slides", "presentation", "pdf", "gdoc"],
    providerIds: ["google_drive", "onedrive", "dropbox", "local"],
    sourceTypes: ["document", "pdf", "spreadsheet", "presentation"],
  },
  {
    keywords: ["page", "database", "notion", "workspace", "wiki"],
    providerIds: ["notion"],
    sourceTypes: ["page", "database"],
  },
  {
    keywords: ["message", "slack", "channel", "thread", "conversation"],
    providerIds: ["slack"],
    sourceTypes: ["message", "thread"],
  },
  {
    keywords: ["note", "notes", "wrote", "saved", "memory", "remember"],
    providerIds: ["neuron", "notion", "local"],
    sourceTypes: ["memory", "page", "local_file"],
  },
  {
    keywords: ["file", "folder", "downloaded", "uploaded"],
    providerIds: ["local", "google_drive", "dropbox", "onedrive"],
    sourceTypes: ["local_file", "document"],
  },
  {
    keywords: ["ticket", "task", "project", "sprint", "backlog"],
    providerIds: ["linear", "jira"],
    sourceTypes: ["issue"],
  },
  {
    keywords: ["design", "figma", "mockup", "prototype", "wireframe"],
    providerIds: ["figma"],
    sourceTypes: ["unknown"],
  },
  {
    keywords: ["email", "gmail", "inbox", "mail"],
    providerIds: ["gmail"],
    sourceTypes: ["message"],
  },
  {
    keywords: ["meeting", "event", "calendar", "schedule", "agenda"],
    providerIds: ["google_calendar"],
    sourceTypes: ["unknown"],
  },
];

// ─── Query Intent Detection ───────────────────────────────────────────────

const INTENT_PATTERNS: Record<RetrievalQuery["intent"], string[]> = {
  locate: ["where", "find", "locate", "which file", "which document", "where did i", "show me where"],
  search: ["what", "tell me about", "explain", "describe", "summarize"],
  list: ["list", "show all", "what are all", "give me all"],
  explain: ["how", "why", "explain", "describe"],
  compare: ["compare", "difference between", "vs ", "versus"],
};

function detectIntent(query: string): RetrievalQuery["intent"] {
  const q = query.toLowerCase();
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (patterns.some((p) => q.includes(p))) {
      return intent as RetrievalQuery["intent"];
    }
  }
  return "search";
}

// ─── Source Router ────────────────────────────────────────────────────────

export interface RouterContext {
  /** IDs of providers the user has connected */
  connectedProviderIds: string[];
}

/**
 * Route a query to the appropriate source providers.
 * Returns the set of providers to search and the routing strategy used.
 */
export function routeQuery(rawQuery: string, context: RouterContext): SourceRoute {
  const q = rawQuery.toLowerCase();
  const { connectedProviderIds } = context;

  // 1. Check for explicit source mentions
  const explicitProviders = new Set<string>();
  for (const [alias, providerId] of Object.entries(EXPLICIT_SOURCE_ALIASES)) {
    if (q.includes(alias) && connectedProviderIds.includes(providerId)) {
      explicitProviders.add(providerId);
    }
  }

  if (explicitProviders.size > 0) {
    return {
      providerIds: [...explicitProviders],
      strategy: "explicit",
      confidence: 0.95,
      reasoning: `User explicitly mentioned: ${[...explicitProviders].join(", ")}`,
    };
  }

  // 2. Check for type hints
  const hintedProviders = new Set<string>();
  for (const hint of TYPE_HINTS) {
    if (hint.keywords.some((kw) => q.includes(kw))) {
      for (const pid of hint.providerIds) {
        if (connectedProviderIds.includes(pid)) {
          hintedProviders.add(pid);
        }
      }
    }
  }

  // Always include Neuron memories for personal queries
  if (connectedProviderIds.includes("neuron")) {
    hintedProviders.add("neuron");
  }

  if (hintedProviders.size > 0) {
    return {
      providerIds: [...hintedProviders],
      strategy: "inferred",
      confidence: 0.7,
      reasoning: `Inferred from query terminology`,
    };
  }

  // 3. Search everything
  return {
    providerIds: [...connectedProviderIds],
    strategy: "all",
    confidence: 0.5,
    reasoning: "No specific source detected — searching all connected sources",
  };
}

/**
 * Parse a raw query into a RetrievalQuery.
 */
export function parseQuery(rawQuery: string, context: RouterContext): RetrievalQuery {
  const normalized = rawQuery.trim().toLowerCase().replace(/\s+/g, " ");
  const route = routeQuery(rawQuery, context);
  const intent = detectIntent(rawQuery);

  // Collect type hints
  const typeHints = new Set<KnowledgeSourceType>();
  const q = normalized;
  for (const hint of TYPE_HINTS) {
    if (hint.keywords.some((kw) => q.includes(kw))) {
      hint.sourceTypes.forEach((t) => typeHints.add(t));
    }
  }

  return {
    raw: rawQuery,
    normalized,
    intent,
    sourceHints: route.providerIds,
    typeHints: [...typeHints],
    route,
    limit: 20,
  };
}

/**
 * Given a query string, extract the names of any providers explicitly mentioned.
 * Returns an array of provider IDs.
 */
export function extractExplicitProviders(query: string): string[] {
  const q = query.toLowerCase();
  const found = new Set<string>();
  for (const [alias, providerId] of Object.entries(EXPLICIT_SOURCE_ALIASES)) {
    if (q.includes(alias)) found.add(providerId);
  }
  return [...found];
}
