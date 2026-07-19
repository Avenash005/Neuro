import { motion } from "framer-motion";
import { ArrowRight, Check, Code2, LogOut, Mail, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { continueWithOAuth, linkAnonymousEmail, signInExistingWithEmail, signOutToGuest } from "../../lib/supabase";

type AuthModalProps = {
  user: User | null;
  onClose: () => void;
};

export function AuthModal({ user, onClose }: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAnonymous = user?.is_anonymous ?? true;

  const run = async (operation: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      if (success) setMessage(success);
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    if (returning) {
      await run(() => signInExistingWithEmail(normalizedEmail), "Check your inbox to sign in. This window can stay open.");
    } else {
      await run(() => linkAnonymousEmail(normalizedEmail), "Confirmation sent. Open the link to keep this account and its memories.");
    }
  };

  const oauth = async (provider: "google" | "github") => run(() => continueWithOAuth(provider, isAnonymous));

  if (user && !isAnonymous) {
    return (
      <motion.div className="modal-card auth-modal" initial={{ opacity: 0, scale: .96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} role="dialog" aria-modal="true">
        <div className="modal-header"><div><span className="card-kicker"><ShieldCheck size={14} /> Secure account</span><h2>Your Neuron account</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
        <div className="account-summary"><span className="account-avatar">{(user.email?.[0] ?? "N").toUpperCase()}</span><div><strong>{user.email ?? "Connected account"}</strong><small>Your memories sync securely across devices.</small></div><span className="verified-badge"><Check size={12} /> Verified</span></div>
        <div className="account-security"><ShieldCheck size={18} /><span><strong>Owner-only data access</strong><small>Supabase Row Level Security scopes every memory to your account.</small></span></div>
        <div className="modal-footer"><span>Signed in securely</span><div><button className="cancel" onClick={onClose}>Close</button><button className="save signout" disabled={busy} onClick={() => run(signOutToGuest, "Signed out. A new guest workspace is ready.")}><LogOut size={15} /> Sign out</button></div></div>
      </motion.div>
    );
  }

  return (
    <motion.div className="modal-card auth-modal" initial={{ opacity: 0, scale: .96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} role="dialog" aria-modal="true">
      <div className="modal-header"><div><span className="card-kicker"><Sparkles size={14} /> Phase 2 account</span><h2>{returning ? "Welcome back" : "Keep your memories forever"}</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
      <div className="auth-copy"><p>{returning ? "Sign in to open your existing Neuron workspace." : "Add a permanent identity without losing anything in this guest workspace."}</p></div>
      <form className="auth-form" onSubmit={submitEmail}>
        <label htmlFor="auth-email">Email address</label>
        <div className="auth-email"><Mail size={17} /><input id="auth-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button disabled={busy} type="submit"><ArrowRight size={17} /></button></div>
      </form>
      <div className="auth-divider"><span>or continue with</span></div>
      <div className="oauth-buttons"><button disabled={busy} onClick={() => oauth("google")}><span className="google-g">G</span> Google</button><button disabled={busy} onClick={() => oauth("github")}><Code2 size={17} /> GitHub</button></div>
      {message && <div className="auth-message success"><Check size={16} /><span>{message}</span></div>}
      {error && <div className="auth-message error"><X size={16} /><span>{error}</span></div>}
      <button className="auth-switch" onClick={() => { setReturning(!returning); setMessage(null); setError(null); }}>{returning ? "New here? Keep this guest workspace" : "Already have an account? Sign in"}</button>
      <div className="auth-privacy"><ShieldCheck size={15} /><span>Your publishable key and session are safe for browser use. Private service keys never reach this app.</span></div>
    </motion.div>
  );
}
