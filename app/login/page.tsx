"use client";

import { useState, useEffect } from "react";
import { login, checkEmail, resetPassword } from "./actions";
import { brand } from '@/config/branding';

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const inputClass =
    "w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/20 text-title-md focus:outline-none focus:ring-2 focus:ring-[rgba(var(--primary-rgb),0.4)] focus:border-[rgba(var(--primary-rgb),0.2)] focus:bg-white/[0.06] transition-all duration-300";

  const labelClass =
    "block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2.5";

  const primaryBtnClass =
    "w-full py-3 text-white font-bold text-title-md transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden group";

  function ErrorBanner({ message }: { message: string }) {
    return (
      <div
        className="flex items-center gap-2.5 px-4 py-3 border"
        style={{
          backgroundColor: "rgba(var(--reject-red-rgb, 242, 53, 69), 0.08)",
          borderColor: "var(--reject-red)",
        }}
      >
        <div
          className="w-5 h-5 flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "rgba(var(--reject-red-rgb, 242, 53, 69), 0.2)" }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--reject-red)" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <p style={{ color: "var(--reject-red)" }} className="text-sm">{message}</p>
      </div>
    );
  }

  function Spinner() {
    return (
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  }

  return (
    <div>
      <main className="flex min-h-screen" style={{ backgroundColor: "var(--surface-base)" }}>
        {/* -- Left Panel: Logo ----------------------------------------- */}
        <div
          className="hidden lg:flex lg:w-[48%] xl:w-[52%] relative overflow-hidden items-center justify-center"
          style={{ backgroundColor: "var(--surface-base)" }}
        >
          {/* Centered logo */}
          <img
            src={brand.logo}
            alt={brand.logoAlt}
            className="w-[80%] max-w-[550px] h-auto"
          />

          {/* Right edge accent line */}
          <div
            className="absolute right-0 top-0 bottom-0 w-px"
            style={{
              background: "linear-gradient(to bottom, transparent, var(--outline) 30%, var(--outline) 70%, transparent)",
            }}
          />
        </div>

        {/* -- Right Panel: Form ---------------------------------------- */}
        <div className="flex-1 flex items-center justify-center px-6 py-12 relative" style={{ backgroundColor: "var(--primary)" }}>
          {/* Mobile background effects */}
          <div
            className="lg:hidden absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] opacity-15 blur-[100px]"
            style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)" }}
          />

          <div
            className="w-full max-w-[420px] relative"
            style={{
              opacity: mounted ? 1 : 0,
              transition: "opacity 0.4s ease-out",
            }}
          >
            {/* Mobile logo */}
            <div className="lg:hidden flex items-center justify-center mb-12">
              <img src={brand.logo} alt={brand.logoAlt} className="h-12" />
            </div>

            {/* Desktop heading */}
            <div className="hidden lg:block mb-10">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-1.5 h-1.5" style={{ backgroundColor: "var(--on-primary, #FFFFFF)" }} />
                <span className="text-white/30 text-label-sm font-semibold uppercase tracking-[0.2em]">
                  {brand.portalTitle}
                </span>
              </div>
            </div>

            {/* -- Card ------------------------------------------------- */}
            <div
              className="p-8 sm:p-10"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                boxShadow: "0 8px 40px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
              }}
            >
              {view === "login" && (
                <div className="form-stagger" key="login">
                  <div className="mb-8">
                    <h1 className="text-white text-[26px] font-extrabold tracking-tight mb-1.5">
                      Welcome back
                    </h1>
                    <p className="text-white/35 text-title-sm">
                      Sign in to your account to continue
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div>
                      <label className={labelClass} htmlFor="email">
                        Email
                      </label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                          </svg>
                        </div>
                        <input
                          id="email"
                          type="email"
                          required
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`${inputClass} login-input pl-11`}
                          placeholder="you@firm.com"
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelClass} htmlFor="password">
                        Password
                      </label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </div>
                        <input
                          id="password"
                          type="password"
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={`${inputClass} login-input pl-11`}
                          placeholder="Enter your password"
                        />
                      </div>
                    </div>

                    {error && <ErrorBanner message={error} />}

                    <button
                      type="submit"
                      disabled={loading}
                      className={`${primaryBtnClass} btn-thick-navy mt-1`}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2.5">
                          <Spinner />
                          Signing in...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          Sign in
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14" />
                            <path d="m12 5 7 7-7 7" />
                          </svg>
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setView("forgot-email");
                        setError("");
                      }}
                      className="text-white/30 hover:text-white/60 text-body-md transition-colors duration-300 mt-1"
                    >
                      Forgot your password?
                    </button>
                  </form>
                </div>
              )}

              {view === "forgot-email" && (
                <div className="form-stagger" key="forgot-email">
                  <div className="mb-8">
                    <button
                      type="button"
                      onClick={goBackToLogin}
                      className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-body-md mb-6 transition-colors duration-300"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 18-6-6 6-6" />
                      </svg>
                      Back to sign in
                    </button>
                    <h1 className="text-white text-[26px] font-extrabold tracking-tight mb-1.5">
                      Reset password
                    </h1>
                    <p className="text-white/35 text-title-sm">
                      Enter your email to verify your account
                    </p>
                  </div>

                  <form onSubmit={handleCheckEmail} className="flex flex-col gap-5">
                    <div>
                      <label className={labelClass}>Email address</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                          </svg>
                        </div>
                        <input
                          type="email"
                          required
                          autoFocus
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          className={`${inputClass} login-input pl-11`}
                          placeholder="you@firm.com"
                        />
                      </div>
                    </div>

                    {error && <ErrorBanner message={error} />}

                    <button
                      type="submit"
                      disabled={loading}
                      className={`${primaryBtnClass} btn-thick-navy mt-1`}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2.5">
                          <Spinner />
                          Verifying...
                        </span>
                      ) : (
                        "Continue"
                      )}
                    </button>
                  </form>
                </div>
              )}

              {view === "forgot-reset" && (
                <div className="form-stagger" key="forgot-reset">
                  <div className="mb-8">
                    <button
                      type="button"
                      onClick={goBackToLogin}
                      className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-body-md mb-6 transition-colors duration-300"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 18-6-6 6-6" />
                      </svg>
                      Back to sign in
                    </button>
                    <h1 className="text-white text-[26px] font-extrabold tracking-tight mb-1.5">
                      New password
                    </h1>
                    <p className="text-white/35 text-title-sm">
                      Hi <span className="text-white/50 font-medium">{resetName}</span>, set your new password below
                    </p>
                  </div>

                  <form onSubmit={handleResetPassword} className="flex flex-col gap-5">
                    <div>
                      <label className={labelClass}>New password</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </div>
                        <input
                          type="password"
                          required
                          autoFocus
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className={`${inputClass} login-input pl-11`}
                          placeholder="Min 8 characters"
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>Confirm password</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                        </div>
                        <input
                          type="password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className={`${inputClass} login-input pl-11`}
                          placeholder="Re-enter password"
                        />
                      </div>
                    </div>

                    {error && <ErrorBanner message={error} />}

                    <button
                      type="submit"
                      disabled={loading}
                      className={`${primaryBtnClass} btn-thick-navy mt-1`}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2.5">
                          <Spinner />
                          Resetting...
                        </span>
                      ) : (
                        "Reset password"
                      )}
                    </button>
                  </form>
                </div>
              )}

              {view === "forgot-done" && (
                <div className="form-stagger" key="forgot-done">
                  <div className="text-center py-6">
                    <div
                      className="w-16 h-16 flex items-center justify-center mx-auto mb-6"
                      style={{
                        backgroundColor: "rgba(var(--match-green-rgb, 10, 153, 129), 0.08)",
                        border: "1px solid rgba(var(--match-green-rgb, 10, 153, 129), 0.15)",
                      }}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--match-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                    <h1 className="text-white text-[26px] font-extrabold tracking-tight mb-2">
                      All set
                    </h1>
                    <p className="text-white/35 text-title-sm mb-8">
                      Your password has been updated successfully.
                    </p>
                    <button
                      onClick={goBackToLogin}
                      className={`${primaryBtnClass} btn-thick-navy`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        Sign in now
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14" />
                          <path d="m12 5 7 7-7 7" />
                        </svg>
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sign up link */}
            {view === "login" && (
              <p
                className="text-center text-white/25 text-body-md mt-8"
                style={{
                  opacity: mounted ? 1 : 0,
                  animation: mounted ? "fade-in-up 0.5s ease-out 0.6s both" : "none",
                }}
              >
                Don&apos;t have an account?{" "}
                <a
                  href="/signup"
                  className="text-white/50 hover:text-white font-medium transition-colors duration-300 underline decoration-white/20 underline-offset-2 hover:decoration-white/50"
                >
                  Create one
                </a>
              </p>
            )}

            {/* Footer */}
            <div
              className="hidden lg:flex items-center justify-center gap-4 mt-16"
              style={{
                opacity: mounted ? 1 : 0,
                animation: mounted ? "fade-in 0.5s ease-out 0.8s both" : "none",
              }}
            >
              <span className="w-8 h-px bg-white/10" />
              <span className="text-white/15 text-label-sm tracking-widest uppercase">
                Secured with 256-bit encryption
              </span>
              <span className="w-8 h-px bg-white/10" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
