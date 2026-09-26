import {
  Bell,
  Command,
  FolderKanban,
  Home,
  Layers3,
  Menu,
  PanelLeftClose,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Moon,
  Search,
  UploadCloud,
  GraduationCap,
  CalendarDays,
  Clock3,
  Network,
  ListTodo,
  HardDrive,
  Shield,
  RefreshCw,
} from "lucide-react";
import type { BackendStatus, View } from "../../types/app";

export function Logo() {
  return (
    <div className="brand-mark" aria-label="Neuron">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

type SidebarProps = {
  activeView: View;
  setActiveView: (view: View) => void;
  openCapture: () => void;
  profileName: string;
  profileSubtitle: string;
  onProfileClick: () => void;
  onSearch: (query: string) => void;
  onSettingsClick: () => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
};

export function Sidebar({
  activeView,
  setActiveView,
  openCapture,
  profileName,
  profileSubtitle,
  onProfileClick,
  onSearch,
  onSettingsClick,
  collapsed,
  setCollapsed,
  theme,
  onToggleTheme,
}: SidebarProps) {
  const nav = [
    { label: "Home" as View, displayLabel: "Dashboard", icon: Home },
    { label: "Sidekick" as View, displayLabel: "AI Chat", icon: Sparkles },
    { label: "Library" as View, displayLabel: "Memories", icon: Layers3 },
    { label: "Tasks" as View, displayLabel: "Tasks", icon: ListTodo },
    { label: "Study" as View, displayLabel: "Study", icon: GraduationCap },
    { label: "Recaps" as View, displayLabel: "Recaps", icon: CalendarDays },
    { label: "Activity" as View, displayLabel: "Activity", icon: Clock3 },
    { label: "Collections" as View, displayLabel: "Collections", icon: FolderKanban },
    { label: "Graph" as View, displayLabel: "Knowledge Graph", icon: Network },
    { label: "LocalKnowledge" as View, displayLabel: "Local Files", icon: HardDrive, dividerBefore: true },
    { label: "Privacy" as View, displayLabel: "Privacy & Data", icon: Shield },
    { label: "Sync" as View, displayLabel: "Sync Status", icon: RefreshCw },
  ];

  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="sidebar-head">
        <div className="brand-lockup">
          <Logo />
          {!collapsed && <span>neuron</span>}
        </div>
        <button
          className="icon-button sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Toggle sidebar"
        >
          <PanelLeftClose size={18} style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
      </div>

      <nav className="side-nav" aria-label="Primary navigation">
        {nav.map(({ label, displayLabel, icon: Icon, ...rest }) => (
          <div key={label}>
            {"dividerBefore" in rest && rest.dividerBefore && (
              <div style={{
                height: 1,
                background: "var(--border-color)",
                margin: "6px 12px",
                opacity: 0.6,
              }} />
            )}
            <button
              className={activeView === label ? "active" : ""}
              onClick={() => setActiveView(label)}
              title={displayLabel}
            >
              <Icon size={19} strokeWidth={1.8} />
              {!collapsed && <span>{displayLabel}</span>}
            </button>
          </div>
        ))}

        <button onClick={openCapture} title="Upload">
          <UploadCloud size={19} strokeWidth={1.8} />
          {!collapsed && <span>Upload</span>}
        </button>
        <button onClick={() => onSearch("")} title="Search">
          <Search size={19} strokeWidth={1.8} />
          {!collapsed && <span>Search</span>}
        </button>
        <button onClick={onSettingsClick} title="Settings">
          <Settings size={19} strokeWidth={1.8} />
          {!collapsed && <span>Settings</span>}
        </button>
      </nav>

      <div className="sidebar-bottom">
        <button onClick={onToggleTheme} title={theme === "light" ? "Dark Mode" : "Light Mode"}>
          {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
          {!collapsed && <span>{theme === "light" ? "Dark Mode" : "Light Mode"}</span>}
        </button>
        <button className="profile-button" title="Profile and account" onClick={onProfileClick}>
          <span className="avatar">{profileName.slice(0, 2).toUpperCase()}</span>
          {!collapsed && (
            <span className="profile-copy">
              <strong>{profileName}</strong>
              <small>{profileSubtitle}</small>
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}

export function SearchBox({ onSearch }: { onSearch: (query: string) => void }) {
  return (
    <div className="search-box" onClick={() => onSearch("")} style={{ cursor: "pointer" }}>
      <Search size={16} />
      <input readOnly placeholder="Search memories... (⌘K)" aria-label="Semantic search" />
      <span className="shortcut">
        <Command size={10} />K
      </span>
    </div>
  );
}

type HeaderProps = {
  onSearch: (query: string) => void;
  openAssistant: () => void;
  openMobileNav: () => void;
  backendStatus: BackendStatus;
  openActivity: () => void;
  openCapture: () => void;
  onProfileClick: () => void;
  profileName?: string;
};

export function Header({
  onSearch,
  openAssistant,
  openMobileNav,
  backendStatus,
  openActivity,
  openCapture,
  onProfileClick,
  profileName = "Neuron User",
}: HeaderProps) {
  const statusLabel =
    backendStatus === "connected"
      ? "Synced"
      : backendStatus === "connecting"
      ? "Connecting..."
      : backendStatus === "error"
      ? "Setup Needed"
      : "Local";

  const avatarInitials = profileName.slice(0, 2).toUpperCase();

  return (
    <header className="topbar">
      <button className="mobile-menu icon-button" onClick={openMobileNav} aria-label="Open menu">
        <Menu size={20} />
      </button>
      <div className="mobile-brand">
        <Logo />
        <span>neuron</span>
      </div>
      <div className="header-search">
        <SearchBox onSearch={onSearch} />
      </div>
      <div className="top-actions">
        <span className={`sync-status ${backendStatus}`} title={`Backend: ${statusLabel}`}>
          <i />
          <span>{statusLabel}</span>
        </span>
        <button className="icon-button notification" aria-label="Open recent activity" title="Recent activity" onClick={openActivity}>
          <Bell size={18} />
        </button>
        <button className="icon-button" aria-label="Quick Capture" title="Quick Capture (⌘N)" onClick={openCapture}>
          <Plus size={18} />
        </button>
        <button className="icon-button ask-ai-btn" aria-label="Ask AI Assistant" title="Ask AI Assistant" onClick={openAssistant}>
          <Sparkles size={18} />
        </button>
        <button className="avatar header-avatar" onClick={onProfileClick} title={`Signed in as ${profileName}`} aria-label="Open profile and settings">
          {avatarInitials}
        </button>
      </div>
    </header>
  );
}
