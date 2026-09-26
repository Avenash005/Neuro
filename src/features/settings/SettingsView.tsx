import { motion, AnimatePresence } from "framer-motion";
import {
  User as UserIcon,
  Shield,
  Paintbrush,
  Brain as BrainIcon,
  HardDrive,
  Bell,
  Laptop,
  Link2,
  CreditCard,
  Eye,
  HelpCircle,
  Info,
  Check,
  LoaderCircle,
  Plus,
  Trash2,
  RefreshCw,
  KeyRound,
  Globe,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Code2,
  Download,
  FileText,
} from "lucide-react";
import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import type { MemoryRecord } from "../../lib/supabase";

type SettingsViewProps = {
  user: User | null;
  memories: MemoryRecord[];
};

type TabType =
  | "account"
  | "security"
  | "appearance"
  | "ai"
  | "storage"
  | "notifications"
  | "devices"
  | "integrations"
  | "billing"
  | "privacy"
  | "help"
  | "about";

export function SettingsView({ user, memories }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("account");
  const [showToast, setShowToast] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const defaultUsername = user?.email ? user.email.split("@")[0] : "neuron_user";
  const defaultFullName = user?.email ? user.email.split("@")[0].charAt(0).toUpperCase() + user.email.split("@")[0].slice(1) : "Neuron User";

  // Initial settings states for dirty check
  const [profileForm, setProfileForm] = useState({
    fullName: defaultFullName,
    username: defaultUsername,
    email: user?.email || "user@neuron.ai",
    phone: "+1 (555) 234-5678",
    bio: "AI researcher & builder. Building my second brain.",
    timezone: "UTC+05:30 (India Standard Time)",
    language: "en-US",
  });

  const [securityForm, setSecurityForm] = useState({
    twoFactor: true,
    recoveryEmail: user?.email ? `recovery.${user.email}` : "recovery@neuron.ai",
  });

  const [appearanceForm, setAppearanceForm] = useState({
    theme: localStorage.getItem("theme") || "dark",
    accentColor: "indigo",
    fontSize: "medium",
    compactMode: false,
    sidebarPosition: "left",
    reduceMotion: false,
    glassmorphism: true,
  });

  const [aiForm, setAiForm] = useState({
    model: "gemini-2.0-flash",
    style: "concise",
    creativity: 0.7,
    length: 500,
    depth: 5,
    citations: true,
    summaries: true,
    suggestions: true,
    categorization: true,
    voiceEnabled: false,
    experimental: false,
  });

  const [notifForm, setNotifForm] = useState({
    email: true,
    push: true,
    weekly: true,
    study: false,
    upload: true,
    processing: true,
    security: true,
    updates: false,
  });

  const [privacyForm, setPrivacyForm] = useState({
    personalized: true,
    analytics: true,
    crash: true,
    anonymous: false,
  });

  // Track if page is dirty (has changes compared to what we have)
  const [isDirty, setIsDirty] = useState(false);

  // Sync visual appearance changes immediately to DOM
  useEffect(() => {
    const root = document.documentElement;
    
    // Theme sync
    if (appearanceForm.theme === "dark") {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else if (appearanceForm.theme === "light") {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      // System theme check
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (systemDark) root.classList.add("dark");
      else root.classList.remove("dark");
    }

    // Accent color sync
    const colors: Record<string, string> = {
      indigo: "#6366f1",
      violet: "#8b5cf6",
      blue: "#3b82f6",
    };
    const hovers: Record<string, string> = {
      indigo: "#4f46e5",
      violet: "#7c3aed",
      blue: "#2563eb",
    };
    const softs: Record<string, string> = {
      indigo: "rgba(99, 102, 241, 0.12)",
      violet: "rgba(139, 92, 246, 0.12)",
      blue: "rgba(59, 130, 246, 0.12)",
    };

    const color = colors[appearanceForm.accentColor] || colors.indigo;
    const hover = hovers[appearanceForm.accentColor] || hovers.indigo;
    const soft = softs[appearanceForm.accentColor] || softs.indigo;

    root.style.setProperty("--brand", color);
    root.style.setProperty("--brand-hover", hover);
    root.style.setProperty("--brand-soft", soft);
    root.style.setProperty("--brand-glow", `${color}33`);

    // Font size sync
    if (appearanceForm.fontSize === "small") {
      root.style.setProperty("--font-size-base", "13px");
    } else if (appearanceForm.fontSize === "large") {
      root.style.setProperty("--font-size-base", "16px");
    } else {
      root.style.setProperty("--font-size-base", "14px");
    }
  }, [appearanceForm]);

  // Handle save changes trigger
  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setIsDirty(false);
      setShowToast("Settings updated successfully");
      setTimeout(() => setShowToast(null), 3000);
    }, 800);
  };

  // Mock items list for Integrations
  const [integrations, setIntegrations] = useState([
    { id: "gdrive", name: "Google Drive", status: "Connected", sync: "15m ago", icon: Globe, color: "text-blue-500" },
    { id: "github", name: "GitHub Repository", status: "Connected", sync: "1h ago", icon: Code2, color: "text-slate-800 dark:text-slate-100" },
    { id: "notion", name: "Notion Workspace", status: "Disconnected", sync: "Never", icon: Link2, color: "text-slate-700" },
    { id: "slack", name: "Slack Notifications", status: "Disconnected", sync: "Never", icon: Bell, color: "text-pink-500" },
  ]);

  const toggleIntegration = (id: string) => {
    setIntegrations(prev =>
      prev.map(item =>
        item.id === id
          ? {
              ...item,
              status: item.status === "Connected" ? "Disconnected" : "Connected",
              sync: item.status === "Connected" ? "Never" : "Just now",
            }
          : item
      )
    );
    setShowToast("Integration updated");
    setTimeout(() => setShowToast(null), 2000);
  };

  // Mock items list for Connected Devices
  const [devices, setDevices] = useState([
    { id: "1", name: "Avenash's MacBook Pro", os: "macOS Sonoma", browser: "Arc Browser", location: "Chennai, India", active: "Active now", current: true },
    { id: "2", name: "iPhone 15 Pro", os: "iOS 17.4", browser: "Mobile Safari", location: "Chennai, India", active: "2 hours ago", current: false },
    { id: "3", name: "Windows Workspace PC", os: "Windows 11 Pro", browser: "Chrome 124", location: "Bangalore, India", active: "3 days ago", current: false },
  ]);

  const terminateDevice = (id: string) => {
    setDevices(prev => prev.filter(d => d.id !== id));
    setShowToast("Device session terminated");
    setTimeout(() => setShowToast(null), 2500);
  };

  // Memory & Storage stats calculations
  const totalMemories = memories.length || 18;
  const pdfCount = memories.filter(m => m.kind === "Upload" && m.original_filename?.toLowerCase().endsWith(".pdf")).length || 6;
  const imageCount = memories.filter(m => m.kind === "Upload" && (m.original_filename?.toLowerCase().match(/\.(png|jpg|jpeg|webp)$/))).length || 4;
  const audioCount = memories.filter(m => m.kind === "Voice").length || 3;
  const noteCount = memories.filter(m => m.kind === "Note").length || 5;

  const sidebarItems = [
    { id: "account" as const, label: "Account", icon: UserIcon },
    { id: "security" as const, label: "Security", icon: Shield },
    { id: "appearance" as const, label: "Appearance", icon: Paintbrush },
    { id: "ai" as const, label: "AI Preferences", icon: BrainIcon },
    { id: "storage" as const, label: "Memory & Storage", icon: HardDrive },
    { id: "notifications" as const, label: "Notifications", icon: Bell },
    { id: "devices" as const, label: "Connected Devices", icon: Laptop },
    { id: "integrations" as const, label: "Integrations", icon: Link2 },
    { id: "billing" as const, label: "Billing & Plan", icon: CreditCard },
    { id: "privacy" as const, label: "Privacy", icon: Eye },
    { id: "help" as const, label: "Help & Support", icon: HelpCircle },
    { id: "about" as const, label: "About", icon: Info },
  ];

  return (
    <main className="page-content settings-page">
      <section className="page-intro">
        <div>
          <span className="eyebrow"><span />Workspace settings</span>
          <h1>Settings</h1>
          <p>Customize your AI preferences, billing plans, connected integrations, and account views.</p>
        </div>
        <div className="sidekick-private">
          <ShieldCheck size={18} />
          <span>
            <strong>Cloud Protected</strong>
            <small>Encrypted end-to-end</small>
          </span>
        </div>
      </section>

      <div className="settings-layout">
        {/* Left Navigation Sidebar */}
        <aside className="settings-nav-sidebar">
          {sidebarItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setIsDirty(false); // reset dirty status on tab navigation
              }}
              className={`settings-nav-item ${activeTab === item.id ? "active" : ""}`}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </aside>

        {/* Right Settings Content Cards */}
        <div className="settings-content-pane">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === "account" && (
                <article className="settings-section-card">
                  <div className="settings-header-block">
                    <h2>Account Profile</h2>
                    <p>Manage your public identity, avatar representation, and account localization.</p>
                  </div>

                  <div className="flex items-center gap-4 py-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="avatar w-16 h-16 text-lg font-bold">{profileForm.fullName.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Avatar Image</h4>
                      <p className="text-xs text-slate-400 mt-0.5">JPG, PNG or GIF. Max size 2MB.</p>
                      <div className="flex gap-2 mt-2">
                        <button className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs font-semibold">Upload Image</button>
                        <button className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded text-xs font-semibold">Remove</button>
                      </div>
                    </div>
                  </div>

                  <div className="settings-form-grid">
                    <div className="settings-field-group">
                      <label>Full Name</label>
                      <input
                        value={profileForm.fullName}
                        onChange={e => {
                          setProfileForm({ ...profileForm, fullName: e.target.value });
                          setIsDirty(true);
                        }}
                      />
                    </div>
                    <div className="settings-field-group">
                      <label>Username</label>
                      <input
                        value={profileForm.username}
                        onChange={e => {
                          setProfileForm({ ...profileForm, username: e.target.value });
                          setIsDirty(true);
                        }}
                      />
                    </div>
                    <div className="settings-field-group">
                      <label>Email Address</label>
                      <input
                        type="email"
                        value={profileForm.email}
                        onChange={e => {
                          setProfileForm({ ...profileForm, email: e.target.value });
                          setIsDirty(true);
                        }}
                      />
                    </div>
                    <div className="settings-field-group">
                      <label>Phone Number</label>
                      <input
                        value={profileForm.phone}
                        onChange={e => {
                          setProfileForm({ ...profileForm, phone: e.target.value });
                          setIsDirty(true);
                        }}
                      />
                    </div>
                    <div className="settings-field-group settings-form-full">
                      <label>Bio</label>
                      <textarea
                        value={profileForm.bio}
                        onChange={e => {
                          setProfileForm({ ...profileForm, bio: e.target.value });
                          setIsDirty(true);
                        }}
                      />
                    </div>
                    <div className="settings-field-group">
                      <label>Time Zone</label>
                      <select
                        value={profileForm.timezone}
                        onChange={e => {
                          setProfileForm({ ...profileForm, timezone: e.target.value });
                          setIsDirty(true);
                        }}
                      >
                        <option>UTC+05:30 (India Standard Time)</option>
                        <option>UTC-08:00 (Pacific Standard Time)</option>
                        <option>UTC+00:00 (Coordinated Universal Time)</option>
                      </select>
                    </div>
                    <div className="settings-field-group">
                      <label>Language</label>
                      <select
                        value={profileForm.language}
                        onChange={e => {
                          setProfileForm({ ...profileForm, language: e.target.value });
                          setIsDirty(true);
                        }}
                      >
                        <option value="en-US">English (United States)</option>
                        <option value="en-GB">English (United Kingdom)</option>
                        <option value="es-ES">Español</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
                    <button className="text-xs text-red-500 hover:underline font-semibold" onClick={() => alert("Are you sure you want to delete your account? This is irreversible.")}>Delete Account...</button>
                    <button className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded text-xs font-semibold flex items-center gap-1"><KeyRound size={13} /> Change Password</button>
                  </div>
                </article>
              )}

              {activeTab === "security" && (
                <article className="settings-section-card">
                  <div className="settings-header-block">
                    <h2>Login & Security</h2>
                    <p>Secure your second brain with password keys, Multi-Factor auth, and session logs.</p>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Two-Factor Authentication (2FA)</h4>
                      <p>Require an authentication code via application keys when logging in.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={securityForm.twoFactor}
                        onChange={e => {
                          setSecurityForm({ ...securityForm, twoFactor: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Backup Recovery Email</h4>
                      <p>Receive password recovery links and critical account security alerts.</p>
                    </div>
                    <input
                      type="email"
                      value={securityForm.recoveryEmail}
                      onChange={e => {
                        setSecurityForm({ ...securityForm, recoveryEmail: e.target.value });
                        setIsDirty(true);
                      }}
                      className="px-3 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-medium"
                      style={{ height: "34px", width: "240px" }}
                    />
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Active Device Sessions</h3>
                    <div className="settings-grid-cards">
                      {devices.map(device => (
                        <div key={device.id} className="settings-item-card">
                          <div className="settings-item-header">
                            <span className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-500"><Laptop size={18} /></span>
                            {device.current && <span className="text-[10px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded font-bold">CURRENT DEVICE</span>}
                          </div>
                          <div className="settings-item-details">
                            <h4>{device.name}</h4>
                            <p>{device.os} · {device.browser}</p>
                            <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1"><Globe size={11} /> {device.location} · {device.active}</p>
                          </div>
                          {!device.current && (
                            <div className="settings-card-actions">
                              <button className="bg-red-50 text-red-500 hover:bg-red-100" onClick={() => terminateDevice(device.id)}>Log Out Session</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              )}

              {activeTab === "appearance" && (
                <article className="settings-section-card">
                  <div className="settings-header-block">
                    <h2>Visual Appearance</h2>
                    <p>Customize themes, colors, and graphics layout rules to make Neuron fit your eye.</p>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Color Scheme</h4>
                      <p>Switch between light contrast mode, midnight dark mode, or follow system configurations.</p>
                    </div>
                    <div className="segmented-control">
                      <button
                        className={appearanceForm.theme === "light" ? "active" : ""}
                        onClick={() => {
                          setAppearanceForm({ ...appearanceForm, theme: "light" });
                          setIsDirty(true);
                        }}
                      >
                        Light
                      </button>
                      <button
                        className={appearanceForm.theme === "dark" ? "active" : ""}
                        onClick={() => {
                          setAppearanceForm({ ...appearanceForm, theme: "dark" });
                          setIsDirty(true);
                        }}
                      >
                        Dark
                      </button>
                      <button
                        className={appearanceForm.theme === "system" ? "active" : ""}
                        onClick={() => {
                          setAppearanceForm({ ...appearanceForm, theme: "system" });
                          setIsDirty(true);
                        }}
                      >
                        System
                      </button>
                    </div>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Accent Color</h4>
                      <p>Set branding colors used across tag tags, highlight links, and buttons.</p>
                    </div>
                    <div className="flex gap-2">
                      {["indigo", "violet", "blue"].map(color => (
                        <button
                          key={color}
                          onClick={() => {
                            setAppearanceForm({ ...appearanceForm, accentColor: color });
                            setIsDirty(true);
                          }}
                          className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center text-white ${
                            appearanceForm.accentColor === color ? "border-slate-800 dark:border-slate-100 scale-105" : "border-transparent"
                          }`}
                          style={{
                            backgroundColor: color === "indigo" ? "#6366f1" : color === "violet" ? "#8b5cf6" : "#3b82f6",
                          }}
                          aria-label={`Accent ${color}`}
                        >
                          {appearanceForm.accentColor === color && <Check size={13} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Font Hierarchy Size</h4>
                      <p>Adjust document readability and text sizes in the reader panes.</p>
                    </div>
                    <select
                      value={appearanceForm.fontSize}
                      onChange={e => {
                        setAppearanceForm({ ...appearanceForm, fontSize: e.target.value });
                        setIsDirty(true);
                      }}
                      className="px-2.5 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-semibold"
                      style={{ height: "34px", width: "120px" }}
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Glassmorphism Elements</h4>
                      <p>Enable frosted glass backdrops on floating bars, menus, and details models.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={appearanceForm.glassmorphism}
                        onChange={e => {
                          setAppearanceForm({ ...appearanceForm, glassmorphism: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Reduce Motion Animations</h4>
                      <p>Substitute slide-out elements with simple fades to conserve device GPU memory.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={appearanceForm.reduceMotion}
                        onChange={e => {
                          setAppearanceForm({ ...appearanceForm, reduceMotion: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Compact Spacing Mode</h4>
                      <p>Condense library padding cells and dashboards grids to display more text items.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={appearanceForm.compactMode}
                        onChange={e => {
                          setAppearanceForm({ ...appearanceForm, compactMode: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>
                </article>
              )}

              {activeTab === "ai" && (
                <article className="settings-section-card">
                  <div className="settings-header-block">
                    <h2>AI Engine Preferences</h2>
                    <p>Calibrate models selection, answer styles, creativity rules, and recall parameters.</p>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Default Reasoning Model</h4>
                      <p>Choose the model to ground answers for Brain Chat Q&A searches.</p>
                    </div>
                    <select
                      value={aiForm.model}
                      onChange={e => {
                        setAiForm({ ...aiForm, model: e.target.value });
                        setIsDirty(true);
                      }}
                      className="px-2.5 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-semibold"
                      style={{ height: "34px", width: "200px" }}
                    >
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash (Default)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                      <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                      <option value="gpt-4o">GPT-4o</option>
                    </select>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Answer Formatting style</h4>
                      <p>Structure the visual style of Neuron's responses.</p>
                    </div>
                    <div className="segmented-control">
                      <button
                        className={aiForm.style === "concise" ? "active" : ""}
                        onClick={() => {
                          setAiForm({ ...aiForm, style: "concise" });
                          setIsDirty(true);
                        }}
                      >
                        Concise
                      </button>
                      <button
                        className={aiForm.style === "detailed" ? "active" : ""}
                        onClick={() => {
                          setAiForm({ ...aiForm, style: "detailed" });
                          setIsDirty(true);
                        }}
                      >
                        Detailed
                      </button>
                      <button
                        className={aiForm.style === "code" ? "active" : ""}
                        onClick={() => {
                          setAiForm({ ...aiForm, style: "code" });
                          setIsDirty(true);
                        }}
                      >
                        Code-Only
                      </button>
                    </div>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Creativity Temperature: {aiForm.creativity}</h4>
                      <p>Higher levels create more conversational text; lower values return rigid, factual summary snippets.</p>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.1"
                      value={aiForm.creativity}
                      onChange={e => {
                        setAiForm({ ...aiForm, creativity: parseFloat(e.target.value) });
                        setIsDirty(true);
                      }}
                      className="w-[180px] accent-indigo-600"
                    />
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Search Recall Depth: {aiForm.depth} sources</h4>
                      <p>Specify the maximum citation count retrieved to ground chat prompts.</p>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={aiForm.depth}
                      onChange={e => {
                        setAiForm({ ...aiForm, depth: parseInt(e.target.value) });
                        setIsDirty(true);
                      }}
                      className="px-3 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-semibold"
                      style={{ height: "34px", width: "80px" }}
                    />
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Source Citations Cards</h4>
                      <p>Display file attachments, bookmarks, and transcripts references below Q&A answers.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={aiForm.citations}
                        onChange={e => {
                          setAiForm({ ...aiForm, citations: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Automatic Summarization</h4>
                      <p>Queue newly captured PDF files, articles, or voice memos for AI abstract and tag indexing.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={aiForm.summaries}
                        onChange={e => {
                          setAiForm({ ...aiForm, summaries: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Enable Experimental Features</h4>
                      <p>Activate real-time voice speech responses and predictive workspace recap notes.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={aiForm.experimental}
                        onChange={e => {
                          setAiForm({ ...aiForm, experimental: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>
                </article>
              )}

              {activeTab === "storage" && (
                <article className="settings-section-card">
                  <div className="settings-header-block">
                    <h2>Memory Storage Limits</h2>
                    <p>View storage availability, folder files count distributions, and perform indexing backups.</p>
                  </div>

                  <div className="storage-progress-container">
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <span>Cloud Storage Used</span>
                      <span>4.2 GB of 10.0 GB (42%)</span>
                    </div>
                    <div className="storage-progress-rail">
                      <div className="storage-progress-fill" style={{ width: "42%" }} />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Upgrade subscription to unlock unlimited storage and files size indexing limits.</p>
                  </div>

                  <div className="grid grid-cols-5 gap-3 border-y border-slate-100 dark:border-slate-800 py-6 my-2 text-center">
                    <div>
                      <strong className="text-xl font-bold text-slate-900 dark:text-slate-100">{totalMemories}</strong>
                      <span className="text-[10px] text-slate-400 block mt-1 uppercase tracking-wider font-semibold">Memories</span>
                    </div>
                    <div>
                      <strong className="text-xl font-bold text-slate-900 dark:text-slate-100">{pdfCount}</strong>
                      <span className="text-[10px] text-slate-400 block mt-1 uppercase tracking-wider font-semibold">PDF Files</span>
                    </div>
                    <div>
                      <strong className="text-xl font-bold text-slate-900 dark:text-slate-100">{imageCount}</strong>
                      <span className="text-[10px] text-slate-400 block mt-1 uppercase tracking-wider font-semibold">Images</span>
                    </div>
                    <div>
                      <strong className="text-xl font-bold text-slate-900 dark:text-slate-100">{audioCount}</strong>
                      <span className="text-[10px] text-slate-400 block mt-1 uppercase tracking-wider font-semibold">Audio</span>
                    </div>
                    <div>
                      <strong className="text-xl font-bold text-slate-900 dark:text-slate-100">{noteCount}</strong>
                      <span className="text-[10px] text-slate-400 block mt-1 uppercase tracking-wider font-semibold">Notes</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Backup & System Operations</h3>
                    <div className="flex flex-wrap gap-2.5">
                      <button className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold flex items-center gap-1.5" onClick={() => alert("Downloading JSON database backup...")}><Download size={14} /> Export Memories JSON</button>
                      <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs font-semibold flex items-center gap-1.5"><Plus size={14} /> Import Data File</button>
                      <button className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-500 rounded text-xs font-semibold flex items-center gap-1.5" onClick={() => alert("Database cache cleared.")}><Trash2 size={14} /> Clear Cache</button>
                    </div>
                  </div>
                </article>
              )}

              {activeTab === "notifications" && (
                <article className="settings-section-card">
                  <div className="settings-header-block">
                    <h2>Notifications Settings</h2>
                    <p>Decide how and when Neuron alerts you on document processes, streaks, and updates.</p>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Global Email Alerts</h4>
                      <p>Receive login summaries, security warnings, and storage alerts via email.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={notifForm.email}
                        onChange={e => {
                          setNotifForm({ ...notifForm, email: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Browser Push Notifications</h4>
                      <p>Receive real-time banners when document imports finish or AI processing completes.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={notifForm.push}
                        onChange={e => {
                          setNotifForm({ ...notifForm, push: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Weekly recap Brief Email</h4>
                      <p>Receive a summarized intelligence narrative detailing what you captured over the week.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={notifForm.weekly}
                        onChange={e => {
                          setNotifForm({ ...notifForm, weekly: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Study Streaks Reminders</h4>
                      <p>Get notified when your learning streak is about to break for the day.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={notifForm.study}
                        onChange={e => {
                          setNotifForm({ ...notifForm, study: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>
                </article>
              )}

              {activeTab === "devices" && (
                <article className="settings-section-card">
                  <div className="settings-header-block">
                    <h2>Connected Devices</h2>
                    <p>Inspect active browser logins and client hardware linked to your second brain.</p>
                  </div>

                  <div className="settings-grid-cards">
                    {devices.map(device => (
                      <div key={device.id} className="settings-item-card">
                        <div className="settings-item-header">
                          <span className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-500"><Laptop size={18} /></span>
                          {device.current && <span className="text-[10px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded font-bold">CURRENT DEVICE</span>}
                        </div>
                        <div className="settings-item-details">
                          <h4>{device.name}</h4>
                          <p>{device.os} · {device.browser}</p>
                          <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1"><Globe size={11} /> {device.location} · {device.active}</p>
                        </div>
                        {!device.current && (
                          <div className="settings-card-actions">
                            <button className="bg-red-50 text-red-500 hover:bg-red-100" onClick={() => terminateDevice(device.id)}>Log Out Device</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800 mt-2">
                    <button className="text-xs text-red-500 hover:underline font-semibold" onClick={() => { setDevices([devices[0]]); alert("Logged out of all other devices."); }}>Terminate All Other Sessions</button>
                  </div>
                </article>
              )}

              {activeTab === "integrations" && (
                <article className="settings-section-card">
                  <div className="settings-header-block">
                    <h2>Connected Integrations</h2>
                    <p>Connect Google Drive, Notion, and GitHub repositories to import files and notes automatically.</p>
                  </div>

                  <div className="settings-grid-cards">
                    {integrations.map(item => (
                      <div key={item.id} className="settings-item-card" style={{ border: item.status === "Connected" ? "1px solid var(--brand-soft)" : "1px solid var(--border-color)" }}>
                        <div className="settings-item-header">
                          <span className={`p-1.5 bg-slate-100 dark:bg-slate-800 rounded ${item.color}`}><item.icon size={18} /></span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${item.status === "Connected" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>{item.status.toUpperCase()}</span>
                        </div>
                        <div className="settings-item-details">
                          <h4>{item.name}</h4>
                          <p className="text-[10px] text-slate-400 mt-1">Last synced: {item.sync}</p>
                        </div>
                        <div className="settings-card-actions">
                          {item.status === "Connected" && (
                            <button className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center gap-1" onClick={() => { alert("Syncing files..."); }}><RefreshCw size={11} /> Sync Now</button>
                          )}
                          <button className={item.status === "Connected" ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-indigo-600 hover:bg-indigo-700 text-white"} onClick={() => toggleIntegration(item.id)}>
                            {item.status === "Connected" ? "Disconnect" : "Connect"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              )}

              {activeTab === "billing" && (
                <article className="settings-section-card">
                  <div className="settings-header-block">
                    <h2>Billing & Subscription</h2>
                    <p>Manage your tier plans, view invoices history, and configure card payment profiles.</p>
                  </div>

                  <div className="p-5 border border-indigo-150 dark:border-indigo-900 bg-indigo-50/20 dark:bg-indigo-950/10 rounded-xl flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider px-2 py-0.5 bg-indigo-100/50 dark:bg-indigo-950/60 rounded">CURRENT PLAN</span>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-2">Neuron Pro Plan</h3>
                      <p className="text-xs text-slate-500 mt-1">Individual developer subscription. Billing date: **August 25, 2026** ($12/month).</p>
                      <div className="flex gap-2.5 mt-4">
                        <button className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold flex items-center gap-1"><Sparkles size={13} /> Upgrade Plan</button>
                        <button className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs font-semibold" onClick={() => alert("Subscription cancelled.")}>Cancel Subscription</button>
                      </div>
                    </div>
                    <div className="text-right">
                      <strong className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">$12<small className="text-xs text-slate-400 font-normal">/mo</small></strong>
                      <p className="text-[10px] text-slate-400 mt-1">Next invoice total: $12.00 USD</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Billing Payment Method</h3>
                    <div className="p-4 border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-bold text-indigo-600">VISA</span>
                        <div>
                          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Visa ending in 4242</h4>
                          <p className="text-xs text-slate-400 mt-0.5">Expires: 12/2028</p>
                        </div>
                      </div>
                      <button className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold" onClick={() => alert("Change card modal opens...")}>Update card</button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Invoices History</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left text-slate-500">
                        <thead className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-100 dark:border-slate-800">
                          <tr>
                            <th className="py-2.5 px-4">Invoice Number</th>
                            <th className="py-2.5 px-4">Billing Date</th>
                            <th className="py-2.5 px-4">Amount</th>
                            <th className="py-2.5 px-4">Status</th>
                            <th className="py-2.5 px-4">Download</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/20">
                            <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">INV-2026-004</td>
                            <td className="py-3 px-4">Jul 25, 2026</td>
                            <td className="py-3 px-4">$12.00</td>
                            <td className="py-3 px-4"><span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold">PAID</span></td>
                            <td className="py-3 px-4"><button className="text-indigo-600 hover:underline" onClick={() => alert("Downloading PDF...")}><Download size={13} /></button></td>
                          </tr>
                          <tr className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/20">
                            <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">INV-2026-003</td>
                            <td className="py-3 px-4">Jun 25, 2026</td>
                            <td className="py-3 px-4">$12.00</td>
                            <td className="py-3 px-4"><span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold">PAID</span></td>
                            <td className="py-3 px-4"><button className="text-indigo-600 hover:underline" onClick={() => alert("Downloading PDF...")}><Download size={13} /></button></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </article>
              )}

              {activeTab === "privacy" && (
                <article className="settings-section-card">
                  <div className="settings-header-block">
                    <h2>Privacy Controls</h2>
                    <p>Manage data collection variables, personalized AI context sync, and exports.</p>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Personalized AI Memory Context</h4>
                      <p>Allow the AI engine to ground responses on historical conversation briefs.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={privacyForm.personalized}
                        onChange={e => {
                          setPrivacyForm({ ...privacyForm, personalized: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  <div className="settings-row-option">
                    <div className="settings-row-info">
                      <h4>Share Usage Analytics</h4>
                      <p>Send diagnostic crash metrics to help optimize desktop performances.</p>
                    </div>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={privacyForm.analytics}
                        onChange={e => {
                          setPrivacyForm({ ...privacyForm, analytics: e.target.checked });
                          setIsDirty(true);
                        }}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  <div className="flex flex-col gap-2 pt-4">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Export Personal Data</h3>
                    <p className="text-xs text-slate-400 leading-relaxed mb-1">Request a full archive of your indexed documents, files contents, bookmarks, and chat histories.</p>
                    <button className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold w-max" onClick={() => alert("Preparing download archive... We'll send an email once ready.")}>Request Data Archive</button>
                  </div>
                </article>
              )}

              {activeTab === "help" && (
                <article className="settings-section-card">
                  <div className="settings-header-block">
                    <h2>Help & Support</h2>
                    <p>Browse documentation guides, file developer bug tickets, and check system status.</p>
                  </div>

                  <div className="settings-grid-cards">
                    <a href="https://docs.neuron.ai" target="_blank" rel="noreferrer" className="settings-item-card hover:border-indigo-400 group">
                      <div className="settings-item-header">
                        <span className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-500"><FileText size={18} /></span>
                        <ExternalLink size={14} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      </div>
                      <div className="settings-item-details">
                        <h4>Documentation</h4>
                        <p>Learn tips for indexing folders, keyboard commands, and advanced searches.</p>
                      </div>
                    </a>

                    <a href="https://discord.gg/neuron" target="_blank" rel="noreferrer" className="settings-item-card hover:border-indigo-400 group">
                      <div className="settings-item-header">
                        <span className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded text-indigo-500"><Globe size={18} /></span>
                        <ExternalLink size={14} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      </div>
                      <div className="settings-item-details">
                        <h4>Community Discord</h4>
                        <p>Ask questions, request features, and share workflows with other builders.</p>
                      </div>
                    </a>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Report a Bug / Request Feature</h3>
                    <div className="settings-field-group mb-3">
                      <label>Short Summary</label>
                      <input placeholder="Example: Voice transcriptions stall on larger M4A files" />
                    </div>
                    <div className="settings-field-group">
                      <label>Details</label>
                      <textarea placeholder="Describe the steps, expected behavior, and what actually occurred..." />
                    </div>
                    <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold mt-3" onClick={() => { alert("Bug reported."); }}>Submit Report</button>
                  </div>
                </article>
              )}

              {activeTab === "about" && (
                <article className="settings-section-card items-center text-center py-10">
                  <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 mb-4">
                    <BrainIcon size={36} />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Neuron AI</h2>
                  <p className="text-xs text-slate-400 mt-1">Version 1.2.4 (Build 4220)</p>
                  <p className="text-sm text-slate-500 max-w-sm mt-4">A grounded, RLS-secured personal second brain designed to store, summarize, and connect your knowledge assets.</p>

                  <div className="flex gap-2 mt-6">
                    <button className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded text-xs font-semibold text-slate-700 dark:text-slate-300" onClick={() => alert("Showing Release Notes...")}>Release Notes</button>
                    <button className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded text-xs font-semibold text-slate-700 dark:text-slate-300" onClick={() => alert("Showing Licenses...")}>Open Licenses</button>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-12">Developed with ❤️ by the Neuron AI team.</p>
                </article>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Floating Unsaved Changes Notification Action Bar */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            className="floating-save-actions"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
          >
            <span>You have unsaved changes in settings</span>
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-xs font-semibold text-slate-600 dark:text-slate-400"
                onClick={() => setIsDirty(false)}
              >
                Reset
              </button>
              <button
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold flex items-center gap-1"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div className="toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
            <span><Check size={15} /></span>
            {showToast}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
