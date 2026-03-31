"use client";

import { useState } from "react";
import { login, checkEmail, resetPassword } from "./actions";

type View = "login" | "forgot-email" | "forgot-reset" | "forgot-done";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetName, setResetName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(email, password);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const redirectMap: Record<string, string> = {
      accountant: "/accountant/dashboard",
      admin: "/admin/dashboard",
      employee: "/employee/dashboard",
    };

    window.location.href = redirectMap[result.role!] ?? "/";
  }

  async function handleCheckEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await checkEmail(resetEmail);
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setResetName(result.name || "");
    setView("forgot-reset");
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const result = await resetPassword(resetEmail, newPassword);
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setView("forgot-done");
  }

  function goBackToLogin() {
    setView("login");
    setError("");
    setResetEmail("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ backgroundColor: '#0D1B2A' }}>
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />
      {/* Gradient glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #A60201 0%, transparent 70%)' }}
      />

      <div className="relative w-full max-w-[400px] mx-4">
        {/* Logo */}
        <div className="flex items-center justify-center mb-10">
          <img src="/logo.png" alt="Autosettle AI Solutions" className="h-14" />
        </div>

        {/* Card */}
        <div className="bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] rounded-xl p-8">

          {view === "login" && (
            <>
              <h1 className="text-white text-xl font-semibold mb-1">Sign in</h1>
              <p className="text-white/40 text-sm mb-7">Enter your credentials to continue</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div>
                  <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2" htmlFor="email">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#A60201]/50 focus:border-[#A60201]/30 transition-all"
                    placeholder="you@firm.com"
                  />
                </div>

                <div>
                  <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#A60201]/50 focus:border-[#A60201]/30 transition-all"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg text-white font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-[#A60201]/25"
                  style={{ backgroundColor: loading ? '#6B1413' : '#A60201' }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    "Sign in"
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setView("forgot-email"); setError(""); }}
                  className="text-white/40 hover:text-white/70 text-sm transition-colors"
                >
                  Forgot password?
                </button>
              </form>
            </>
          )}

          {view === "forgot-email" && (
            <>
              <h1 className="text-white text-xl font-semibold mb-1">Reset password</h1>
              <p className="text-white/40 text-sm mb-7">Enter your email to verify your account</p>

              <form onSubmit={handleCheckEmail} className="flex flex-col gap-5">
                <div>
                  <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#A60201]/50 focus:border-[#A60201]/30 transition-all"
                    placeholder="you@firm.com"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg text-white font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-[#A60201]/25"
                  style={{ backgroundColor: loading ? '#6B1413' : '#A60201' }}
                >
                  {loading ? "Checking..." : "Continue"}
                </button>

                <button
                  type="button"
                  onClick={goBackToLogin}
                  className="text-white/40 hover:text-white/70 text-sm transition-colors"
                >
                  Back to sign in
                </button>
              </form>
            </>
          )}

          {view === "forgot-reset" && (
            <>
              <h1 className="text-white text-xl font-semibold mb-1">Set new password</h1>
              <p className="text-white/40 text-sm mb-7">Hi {resetName}, enter your new password below</p>

              <form onSubmit={handleResetPassword} className="flex flex-col gap-5">
                <div>
                  <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2">
                    New password
                  </label>
                  <input
                    type="password"
                    required
                    autoFocus
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#A60201]/50 focus:border-[#A60201]/30 transition-all"
                    placeholder="Min 8 characters"
                  />
                </div>

                <div>
                  <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#A60201]/50 focus:border-[#A60201]/30 transition-all"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg text-white font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-[#A60201]/25"
                  style={{ backgroundColor: loading ? '#6B1413' : '#A60201' }}
                >
                  {loading ? "Resetting..." : "Reset password"}
                </button>

                <button
                  type="button"
                  onClick={goBackToLogin}
                  className="text-white/40 hover:text-white/70 text-sm transition-colors"
                >
                  Back to sign in
                </button>
              </form>
            </>
          )}

          {view === "forgot-done" && (
            <>
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h1 className="text-white text-xl font-semibold mb-2">Password reset</h1>
                <p className="text-white/40 text-sm mb-6">Your password has been updated. You can now sign in.</p>
                <button
                  onClick={goBackToLogin}
                  className="w-full py-2.5 rounded-lg text-white font-semibold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-[#A60201]/25"
                  style={{ backgroundColor: '#A60201' }}
                >
                  Back to sign in
                </button>
              </div>
            </>
          )}

        </div>

        {view === "login" && (
          <p className="text-center text-white/30 text-sm mt-6">
            Don&apos;t have an account?{' '}
            <a href="/signup" className="text-white/60 hover:text-white underline transition-colors">Sign up</a>
          </p>
        )}
      </div>
    </main>
  );
}
