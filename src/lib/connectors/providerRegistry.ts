/**
 * Neuron AI — Integration Provider Registry
 *
 * Central catalog of all supported integration providers.
 * New integrations are added here without changing the retrieval engine.
 */

import type { IntegrationProvider } from "../../types/connectors";

// ─── Provider Definitions ─────────────────────────────────────────────────

export const PROVIDERS: Record<string, IntegrationProvider> = {
  local: {
    id: "local",
    name: "Local Files",
    description: "Files from folders you've explicitly connected on this device.",
    iconEmoji: "🖥",
    category: "local",
    authType: "local",
    capabilities: ["search", "get_document", "list_items", "sync"],
    scopes: [],
    permissionsGranted: [
      "Read files in connected folders",
      "Index file content for search",
    ],
    permissionsDenied: [
      "Access files outside connected folders",
      "Scan entire computer",
      "Upload files without permission",
    ],
  },

  neuron: {
    id: "neuron",
    name: "Neuron Memories",
    description: "Notes, uploads, and knowledge items you've saved to Neuron.",
    iconEmoji: "🧠",
    category: "notes",
    authType: "none",
    capabilities: ["search", "get_document", "list_items"],
    scopes: [],
    permissionsGranted: [
      "Search your saved memories",
      "Retrieve memory content",
    ],
    permissionsDenied: [],
  },

  github: {
    id: "github",
    name: "GitHub",
    description: "Repositories, files, issues, and pull requests from GitHub.",
    iconEmoji: "🐙",
    category: "code",
    authType: "oauth2",
    capabilities: ["search", "get_document", "list_items", "sync", "get_metadata"],
    scopes: ["repo:read", "read:org"],
    permissionsGranted: [
      "Read repositories you authorize",
      "Read repository files and README",
      "Read issues and pull requests",
      "Read commit history",
    ],
    permissionsDenied: [
      "Modify or delete code",
      "Create repositories",
      "Push commits",
      "Access private repos unless explicitly authorized",
    ],
    docsUrl: "https://docs.github.com/en/apps/oauth-apps",
  },

  google_drive: {
    id: "google_drive",
    name: "Google Drive",
    description: "Documents, PDFs, spreadsheets, and files from Google Drive.",
    iconEmoji: "📁",
    category: "storage",
    authType: "oauth2",
    capabilities: ["search", "get_document", "list_items", "sync", "get_metadata"],
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    permissionsGranted: [
      "Read files and folders",
      "Search file content",
      "Read file metadata",
    ],
    permissionsDenied: [
      "Modify or delete files",
      "Share files",
      "Access Google Mail or Calendar",
    ],
    docsUrl: "https://developers.google.com/drive/api",
  },

  notion: {
    id: "notion",
    name: "Notion",
    description: "Pages, databases, and notes from your Notion workspace.",
    iconEmoji: "📓",
    category: "notes",
    authType: "oauth2",
    capabilities: ["search", "get_document", "list_items", "sync"],
    scopes: ["read_content"],
    permissionsGranted: [
      "Read pages and databases you share with Neuron",
      "Search page content",
    ],
    permissionsDenied: [
      "Edit or delete pages",
      "Access pages not shared with Neuron",
    ],
    docsUrl: "https://developers.notion.com/docs/authorization",
  },

  slack: {
    id: "slack",
    name: "Slack",
    description: "Messages and threads from authorized Slack channels.",
    iconEmoji: "💬",
    category: "messaging",
    authType: "oauth2",
    capabilities: ["search", "list_items", "sync"],
    scopes: [
      "channels:history",
      "channels:read",
      "search:read",
    ],
    permissionsGranted: [
      "Search messages in public channels",
      "Read channel list",
    ],
    permissionsDenied: [
      "Send messages",
      "Access direct messages",
      "Access private channels without invitation",
    ],
    docsUrl: "https://api.slack.com/authentication/oauth-v2",
  },

  dropbox: {
    id: "dropbox",
    name: "Dropbox",
    description: "Files and folders stored in your Dropbox account.",
    iconEmoji: "📦",
    category: "storage",
    authType: "oauth2",
    capabilities: ["search", "get_document", "list_items", "sync"],
    scopes: ["files.content.read", "files.metadata.read"],
    permissionsGranted: [
      "Read files and folders",
      "Search file content",
    ],
    permissionsDenied: [
      "Modify or delete files",
      "Access account settings",
    ],
  },

  onedrive: {
    id: "onedrive",
    name: "OneDrive",
    description: "Files and documents from Microsoft OneDrive.",
    iconEmoji: "☁",
    category: "storage",
    authType: "oauth2",
    capabilities: ["search", "get_document", "list_items", "sync"],
    scopes: ["Files.Read"],
    permissionsGranted: [
      "Read files and folders",
      "Search file content",
    ],
    permissionsDenied: [
      "Modify or delete files",
      "Access email or calendar",
    ],
  },

  google_calendar: {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Events and schedules from Google Calendar.",
    iconEmoji: "📅",
    category: "calendar",
    authType: "oauth2",
    capabilities: ["search", "list_items", "sync"],
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    permissionsGranted: ["Read calendar events"],
    permissionsDenied: ["Create or modify events"],
  },

  gmail: {
    id: "gmail",
    name: "Gmail",
    description: "Email threads and messages from Gmail.",
    iconEmoji: "✉",
    category: "mail",
    authType: "oauth2",
    capabilities: ["search", "get_document", "sync"],
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    permissionsGranted: ["Read emails you authorize"],
    permissionsDenied: ["Send emails", "Delete emails", "Modify labels"],
  },

  figma: {
    id: "figma",
    name: "Figma",
    description: "Design files and components from Figma.",
    iconEmoji: "🎨",
    category: "design",
    authType: "oauth2",
    capabilities: ["search", "list_items", "get_metadata"],
    scopes: ["files:read"],
    permissionsGranted: ["Read file names and metadata"],
    permissionsDenied: ["Edit designs"],
  },

  linear: {
    id: "linear",
    name: "Linear",
    description: "Issues, projects, and updates from Linear.",
    iconEmoji: "📐",
    category: "project",
    authType: "oauth2",
    capabilities: ["search", "list_items", "sync"],
    scopes: ["read"],
    permissionsGranted: ["Read issues and projects"],
    permissionsDenied: ["Create or modify issues"],
  },

  jira: {
    id: "jira",
    name: "Jira",
    description: "Issues and projects from Atlassian Jira.",
    iconEmoji: "🔵",
    category: "project",
    authType: "oauth2",
    capabilities: ["search", "list_items", "sync"],
    scopes: ["read:jira-work"],
    permissionsGranted: ["Read issues and projects"],
    permissionsDenied: ["Create or modify issues"],
  },
};

/** Get a provider by ID, throws if not found */
export function getProvider(id: string): IntegrationProvider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown integration provider: "${id}"`);
  return p;
}

/** List all providers, optionally filtered by category */
export function listProviders(category?: IntegrationProvider["category"]): IntegrationProvider[] {
  const all = Object.values(PROVIDERS);
  if (!category) return all;
  return all.filter((p) => p.category === category);
}

/** The providers that are featured / initially shown in the UI */
export const FEATURED_PROVIDER_IDS = [
  "local",
  "neuron",
  "github",
  "google_drive",
  "notion",
  "slack",
  "dropbox",
  "onedrive",
];
