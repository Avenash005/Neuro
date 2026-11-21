/**
 * VIOLET AI — Phase 3G: Dedicated One-Time Owner Setup Screen
 *
 * Provides a clean, VIOLET-branded first-run provisioning screen strictly for
 * the configured owner email. Permanently seals the system upon completion.
 */

import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Session, User } from "@supabase/supabase-js";
import { signUpWithEmailPassword, isOwnerUser } from "../../lib/supabase";
import { globalVioletAIClient } from "../../lib/violet/ai/apiClient";

interface VioletOwnerSetupProps {
  configuredOwnerEmail?: string | null;
  onSuccess: (user: User, session: Session) => void;
  onNavigateToLogin?: () => void;
}

export function VioletOwnerSetup({
  configuredOwnerEmail,
  onSuccess,
  onNavigateToLogin,
}: VioletOwnerSetupProps) {
  const [email, setEmail] = useState(configuredOwnerEmail || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password strength computation
  const getPasswordStrength = (pwd: string): { score: number; label: string; color: string } => {
    if (!pwd) return { score: 0, label: "", color: "bg-slate-700" };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 2) return { score, label: "Weak", color: "bg-rose-500" };
    if (score <= 4) return { score, label: "Good", color: "bg-amber-500" };
    return { score, label: "Strong", color: "bg-emerald-500" };
  };

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Please provide an owner email address.");
      return;
    }

    // Strict configured owner email check
    if (configuredOwnerEmail) {
      const expected = configuredOwnerEmail.trim().toLowerCase();
      if (cleanEmail !== expected) {
        setError(
          `Access restricted: Only the configured owner email ('${configuredOwnerEmail}') is permitted to bootstrap VIOLET.`
        );
        return;
      }
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long for system security.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    try {
      setBusy(true);

      // 1. Create Local Account in PostgreSQL
      const { user, session } = await signUpWithEmailPassword(cleanEmail, password);
      if (!user) {
        throw new Error("Failed to register owner account. No user record returned.");
      }
      if (!session) {
        throw new Error("Registration failed: No authenticated session returned from local server.");
      }

      // 2. Validate owner identity upfront
      const ownerCheck = isOwnerUser(user, configuredOwnerEmail);
      if (!ownerCheck.isOwner) {
        throw new Error(ownerCheck.reason || "Account does not match configured owner.");
      }

      // 3. Complete backend bootstrap to permanently lock registration
      try {
        await globalVioletAIClient.completeOwnerBootstrap(cleanEmail, user.id);
      } catch (bootstrapErr) {
        console.warn("[VioletOwnerSetup] Backend bootstrap notification:", bootstrapErr);
      }

      // 4. Launch VIOLET directly with the newly created local session
      globalVioletAIClient.setAuthToken(session.access_token);
      onSuccess(user, session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-950 px-4 py-8 text-slate-100">
      <div className="relative w-full max-w-lg">
        {/* Glow ambient background aura */}
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-violet-600/30 via-indigo-600/30 to-purple-600/30 opacity-50 blur-2xl pointer-events-none" />

        <div className="relative rounded-2xl border border-violet-500/30 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
          {/* Brand & Setup Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/30 border border-violet-500/50 text-violet-300 shadow-inner mb-3">
              <Bot size={28} />
              <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[10px] text-white">
                <Sparkles size={10} />
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <Shield size={12} /> One-Time Owner Setup
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Welcome to VIOLET AI
            </h1>
            <p className="mt-1 text-xs text-slate-400 max-w-sm">
              Initialize your private single-owner credentials. Once created, registration is
              permanently disabled and VIOLET is locked to you.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3.5 text-xs text-rose-300">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Owner Email */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-slate-300">Owner Email Address</label>
                {configuredOwnerEmail && (
                  <span className="text-[11px] text-violet-400 font-medium">Configured Owner</span>
                )}
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@yourdomain.com"
                  readOnly={Boolean(configuredOwnerEmail)}
                  className={`w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm outline-none transition-all ${
                    configuredOwnerEmail
                      ? "border-violet-500/40 bg-slate-950/80 text-violet-200 cursor-default"
                      : "border-slate-800 bg-slate-950 text-slate-100 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  }`}
                />
              </div>
              {configuredOwnerEmail && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Locked to system environment: <code className="text-violet-300">{configuredOwnerEmail}</code>
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                Master Password (min 8 characters)
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-10 py-2.5 text-sm text-slate-100 outline-none transition-all focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Password strength bar */}
              {password && (
                <div className="mt-2 space-y-1">
                  <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full transition-all duration-300 ${strength.color}`}
                      style={{ width: `${(strength.score / 5) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Strength: {strength.label}</span>
                    <span>8+ chars, upper, numbers & symbols recommended</span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                Confirm Master Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <KeyRound size={16} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-10 py-2.5 text-sm text-slate-100 outline-none transition-all focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
                {confirmPassword && confirmPassword === password && (
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-emerald-400">
                    <Check size={16} />
                  </div>
                )}
              </div>
            </div>

            {/* Security Guarantee Box */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-[11px] text-slate-400 space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-slate-300">
                <ShieldCheck size={14} className="text-violet-400" />
                <span>Single-Owner Architecture Guarantee</span>
              </div>
              <p>
                This account will own all workspace data, Multi-Agent pipelines, and local agent
                permissions. No other users can register after bootstrap.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition-all hover:bg-violet-500 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Bootstrapping VIOLET...</span>
                </>
              ) : (
                <>
                  <span>Create Owner Account & Launch VIOLET</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Subtext: Already have an account? */}
          {onNavigateToLogin && (
            <div className="mt-5 text-center text-xs text-slate-500">
              Already bootstrapped on this or another machine?{" "}
              <button
                type="button"
                onClick={onNavigateToLogin}
                className="font-medium text-violet-400 hover:text-violet-300 transition-colors"
              >
                Sign In to Owner Account
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
