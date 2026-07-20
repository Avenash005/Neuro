import {
  ArrowRight,
  Bell,
  Clock3,
  Command,
  FolderKanban,
  Home,
  Layers3,
  Menu,
  Network,
  PanelLeftClose,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import type { BackendStatus, View } from "../../types/app";

export function Logo() {
  return (
    <div className="brand-mark" aria-label="Neuron">
      <span /><span /><span /><span />
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
};

export function Sidebar({ activeView, setActiveView, openCapture, profileName, profileSubtitle, onProfileClick, onSearch, onSettingsClick }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const nav = [
    { label: "Home" as View, icon: Home },
    { label: "Library" as View, icon: Layers3 },
    { label: "Activity" as View, icon: Clock3 },
    { label: "Collections" as View, icon: FolderKanban },
    { label: "Graph" as View, icon: Network },
  ];

  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="sidebar-head">
        <div className="brand-lockup"><Logo />{!collapsed && <span>neuron</span>}</div>
        <button className="icon-button sidebar-toggle" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar"><PanelLeftClose size={18} /></button>
      </div>
      <button className="capture-button" onClick={openCapture}><Plus size={18} />{!collapsed && <span>Quick capture</span>}</button>
      <nav className="side-nav" aria-label="Primary navigation">
        {nav.map(({ label, icon: Icon }) => (
          <button key={label} className={activeView === label ? "active" : ""} onClick={() => setActiveView(label)} title={label}>
            <Icon size={19} strokeWidth={1.8} />{!collapsed && <span>{label === "Graph" ? "Knowledge graph" : label}</span>}
          </button>
        ))}
      </nav>
      {!collapsed && (
        <div className="sidebar-section">
          <div className="section-label"><span>Favorites</span><button aria-label="Create collection" onClick={() => setActiveView("Collections")}><Plus size={14} /></button></div>
          <button onClick={() => onSearch("Neuron")}><span className="nav-dot violet" />Neuron</button>
          <button onClick={() => onSearch("Web development")}><span className="nav-dot green" />Web development</button>
          <button onClick={() => onSearch("Startup")}><span className="nav-dot orange" />Startup library</button>
        </div>
      )}
      <div className="sidebar-bottom">
        <button title="Settings" onClick={onSettingsClick}><Settings size={19} />{!collapsed && <span>Settings</span>}</button>
        <button className="profile-button" title="Profile and account" onClick={onProfileClick}><span className="avatar">{profileName.slice(0, 2).toUpperCase()}</span>{!collapsed && <span className="profile-copy"><strong>{profileName}</strong><small>{profileSubtitle}</small></span>}</button>
      </div>
    </aside>
  );
}

export function SearchBox({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState("");
  return (
    <form className="search-box" onSubmit={(event) => { event.preventDefault(); onSearch(query); }}>
      <div className="search-icon"><Sparkles size={20} /></div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask your second brain anything..." aria-label="Semantic search" />
      <button type="submit" aria-label="Search"><ArrowRight size={19} /></button>
      <span className="shortcut"><Command size={12} /> K</span>
    </form>
  );
}

type HeaderProps = {
  onSearch: (query: string) => void;
  openAssistant: () => void;
  openMobileNav: () => void;
  backendStatus: BackendStatus;
  openActivity: () => void;
};

export function Header({ onSearch, openAssistant, openMobileNav, backendStatus, openActivity }: HeaderProps) {
  const statusLabel = backendStatus === "connected" ? "Supabase synced" : backendStatus === "connecting" ? "Connecting" : backendStatus === "error" ? "Setup needed" : "Local mode";
  return (
    <header className="topbar">
      <button className="mobile-menu icon-button" onClick={openMobileNav} aria-label="Open menu"><Menu size={20} /></button>
      <div className="mobile-brand"><Logo /><span>neuron</span></div>
      <div className="header-search"><SearchBox onSearch={onSearch} /></div>
      <div className="top-actions">
        <span className={`sync-status ${backendStatus}`}><i />{statusLabel}</span>
        <button className="icon-button notification" aria-label="Open recent activity" onClick={openActivity}><Bell size={19} /><span /></button>
        <button className="ask-ai" onClick={openAssistant}><Sparkles size={16} />Ask Neuron</button>
      </div>
    </header>
  );
}
