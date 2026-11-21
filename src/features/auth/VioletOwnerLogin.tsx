/**
 * VIOLET AI & Lab — Owner Authentication & Protected Login Screen
 *
 * Implements Supabase email/password authentication and account creation
 * strictly restricted to the authorized VIOLET owner.
 * Never exposes Supabase secret service keys to client code.
 */

import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
} from "lucide-react";
import type { Session, User } from "@supabase/supabase-js";
import {
  isOwnerUser,
  resetPasswordForEmail,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  signOutUser,
} from "../../lib/supabase";

interface Props {
  configuredOwnerEmail?: string | null;
  initialError?: string | null;
  bootstrapLocked?: boolean;
  onSuccess: (user: User, session: Session) => void;
}

export function VioletOwnerLogin({
  configuredOwnerEmail,
  initialError,
  bootstrapLocked = false,
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState(configuredOwnerEmail || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    // ── Mode: Forgot Password ────────────────────────────────────────────────
    if (mode === "forgot") {
      try {
        setBusy(true);
        await resetPasswordForEmail(cleanEmail);
        setSuccessMessage(`Password reset link sent to ${cleanEmail}. Please check your inbox.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send password reset email.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // ── Mode: Sign Up ────────────────────────────────────────────────────────
    if (mode === "signup") {
      if (bootstrapLocked) {
        setError("Registration is permanently disabled. This VIOLET instance has already been provisioned.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      // Check owner restriction upfront if an owner email is configured
      if (configuredOwnerEmail && cleanEmail !== configuredOwnerEmail.trim().toLowerCase()) {
        setError(`Access restricted: This instance is reserved for owner '${configuredOwnerEmail}'.`);
        return;
      }

      try {
        setBusy(true);
        const { user, session } = await signUpWithEmailPassword(cleanEmail, password);
        if (session && user) {
          const ownerCheck = isOwnerUser(user, configuredOwnerEmail);
          if (!ownerCheck.isOwner) {
            await signOutUser();
            setError(ownerCheck.reason || "Access restricted to VIOLET owner.");
            return;
          }
          onSuccess(user, session);
        } else {
          setSuccessMessage(
            "Account created successfully in local database! You can now sign in."
          );
          setMode("signin");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create account. Please try again.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // ── Mode: Sign In ────────────────────────────────────────────────────────
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    try {
      setBusy(true);
      const { user, session } = await signInWithEmailPassword(cleanEmail, password);

      // Validate owner identity
      const ownerCheck = isOwnerUser(user, configuredOwnerEmail);
      if (!ownerCheck.isOwner) {
        await signOutUser();
        setError(ownerCheck.reason || "Access restricted to VIOLET owner.");
        return;
      }

      onSuccess(user, session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("invalid login credentials")) {
        setError("Invalid email or password. Please verify your credentials.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at top, #1e1b4b 0%, #0f172a 45%, #020617 100%)",
        color: "#f8fafc",
        padding: 20,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "rgba(30, 41, 59, 0.7)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 16,
          padding: "36px 32px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(139, 92, 246, 0.15)",
        }}
      >
        {/* Brand Icon & Heading */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: "0 auto 16px",
              borderRadius: 14,
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 10px 25px rgba(124, 58, 237, 0.4)",
            }}
          >
            <Bot size={30} color="#ffffff" />
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 20,
              background: "rgba(139, 92, 246, 0.15)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              fontSize: 11,
              fontWeight: 600,
              color: "#c084fc",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}
          >
            <ShieldCheck size={13} />
            <span>Owner Authentication</span>
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", color: "#ffffff" }}>
            {mode === "signin"
              ? "Welcome to VIOLET"
              : mode === "signup"
              ? "Create Owner Account"
              : "Reset Password"}
          </h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>
            {mode === "signin"
              ? bootstrapLocked
                ? "Private single-owner system. Registration is permanently closed."
                : "Private, single-user autonomous AI software engineering platform."
              : mode === "signup"
              ? "Register your credentials to secure your private VIOLET workspace."
              : "Enter your owner email address to receive password reset instructions."}
          </p>
        </div>

        {/* Mode Switcher Tabs (Sign In vs Create Account) */}
        {mode !== "forgot" && !bootstrapLocked && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              background: "rgba(15, 23, 42, 0.6)",
              padding: 4,
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setSuccessMessage(null);
              }}
              style={{
                padding: "8px 0",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 6,
                border: "none",
                background: mode === "signin" ? "#7c3aed" : "transparent",
                color: mode === "signin" ? "#ffffff" : "#94a3b8",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
                setSuccessMessage(null);
              }}
              style={{
                padding: "8px 0",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 6,
                border: "none",
                background: mode === "signup" ? "#7c3aed" : "transparent",
                color: mode === "signup" ? "#ffffff" : "#94a3b8",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Configured Owner Notice */}
        {configuredOwnerEmail && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.25)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: "#93c5fd",
              marginBottom: 16,
            }}
          >
            <Shield size={14} color="#60a5fa" />
            <span>
              Configured owner: <strong>{configuredOwnerEmail}</strong>
            </span>
          </div>
        )}

        {/* Error Alert Banner */}
        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 12,
              color: "#fca5a5",
              marginBottom: 16,
              lineHeight: 1.4,
            }}
          >
            <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert Banner */}
        {successMessage && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 12,
              color: "#6ee7b7",
              marginBottom: 16,
              lineHeight: 1.4,
            }}
          >
            <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Email field */}
          <div>
            <label
              htmlFor="violet-email"
              style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}
            >
              Email Address
            </label>
            <div style={{ position: "relative" }}>
              <Mail
                size={16}
                color="#64748b"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                id="violet-email"
                type="email"
                required
                autoComplete="email"
                placeholder={configuredOwnerEmail || "owner@example.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: 8,
                  padding: "10px 12px 10px 38px",
                  fontSize: 13,
                  color: "#f8fafc",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Password field (not needed in forgot password mode) */}
          {mode !== "forgot" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label
                  htmlFor="violet-password"
                  style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1" }}
                >
                  Password
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#a78bfa",
                      fontSize: 11,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <Lock
                  size={16}
                  color="#64748b"
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
                />
                <input
                  id="violet-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: 8,
                    padding: "10px 38px 10px 38px",
                    fontSize: 13,
                    color: "#f8fafc",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "#64748b",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Confirm Password (for sign up) */}
          {mode === "signup" && (
            <div>
              <label
                htmlFor="violet-confirm-password"
                style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}
              >
                Confirm Password
              </label>
              <div style={{ position: "relative" }}>
                <KeyRound
                  size={16}
                  color="#64748b"
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
                />
                <input
                  id="violet-confirm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: 8,
                    padding: "10px 12px 10px 38px",
                    fontSize: 13,
                    color: "#f8fafc",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={busy}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "11px 16px",
              background: "linear-gradient(135deg, #7c3aed, #6366f1)",
              border: "none",
              borderRadius: 8,
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 4px 14px rgba(124, 58, 237, 0.3)",
              opacity: busy ? 0.7 : 1,
              transition: "all 0.15s ease",
            }}
          >
            {busy ? (
              <span>Authenticating...</span>
            ) : mode === "signin" ? (
              <>
                <span>Sign In as Owner</span>
                <ArrowRight size={16} />
              </>
            ) : mode === "signup" ? (
              <>
                <span>Create Owner Account</span>
                <ArrowRight size={16} />
              </>
            ) : (
              <>
                <span>Send Reset Link</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {/* Back to sign in link for forgot password */}
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setSuccessMessage(null);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "center",
                marginTop: 4,
              }}
            >
              Back to Sign In
            </button>
          )}
        </form>

        {/* Security & Architecture Guarantee Footnote */}
        <div
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            paddingTop: 16,
            marginTop: 24,
            fontSize: 11,
            color: "#64748b",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldCheck size={13} color="#10b981" />
            <span>Protected by Supabase Auth with Row Level Security.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={13} color="#8b5cf6" />
            <span>Browser-safe client: Private service keys never reach frontend code.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
