"use client";

import { useState, useEffect } from "react";
import { login, checkEmail, resetPassword } from "./actions";
import { brand } from '@/config/branding';

type View = "login" | "forgot-email" | "forgot-reset" | "forgot-done";

/* ── Gear SVG generator ─────────────────────────────────────────── */
function GearRing({
  radius,
  teeth,
  toothDepth,
  toothWidth,
  strokeColor,
  duration,
  reverse,
  className,
}: {
  radius: number;
  teeth: number;
  toothDepth: number;
  toothWidth: number;
  strokeColor: string;
  duration: number;
  reverse?: boolean;
  className?: string;
}) {
  const size = (radius + toothDepth + 2) * 2;
  const cx = size / 2;
  const cy = size / 2;

  const toothPaths: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const angle = (i / teeth) * Math.PI * 2;
    const halfTooth = (toothWidth / radius) * 0.5;

    const x1 = cx + radius * Math.cos(angle - halfTooth);
    const y1 = cy + radius * Math.sin(angle - halfTooth);
    const x2 = cx + (radius + toothDepth) * Math.cos(angle - halfTooth * 0.6);
    const y2 = cy + (radius + toothDepth) * Math.sin(angle - halfTooth * 0.6);
    const x3 = cx + (radius + toothDepth) * Math.cos(angle + halfTooth * 0.6);
    const y3 = cy + (radius + toothDepth) * Math.sin(angle + halfTooth * 0.6);
    const x4 = cx + radius * Math.cos(angle + halfTooth);
    const y4 = cy + radius * Math.sin(angle + halfTooth);

    toothPaths.push(`M${x1},${y1} L${x2},${y2} L${x3},${y3} L${x4},${y4}`);
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{
        animation: `${reverse ? "gear-spin-reverse" : "gear-spin"} ${duration}s linear infinite`,
        position: "absolute",
        left: "50%",
        top: "50%",
        marginLeft: -size / 2,
        marginTop: -size / 2,
      }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
      />
      {toothPaths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={strokeColor} strokeWidth="1.5" />
      ))}
    </svg>
  );
}

/* ── Floating particle ──────────────────────────────────────────── */
function Particle({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  return (
    <div
      className="absolute rounded-full"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        backgroundColor: "rgba(var(--accent-rgb), 0.3)",
        animation: `particle-float 8s ease-in-out ${delay}s infinite`,
      }}
    />
  );
}

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
    "w-full px-4 py-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/20 text-title-md focus:outline-none focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.4)] focus:border-[rgba(var(--accent-rgb),0.2)] focus:bg-white/[0.06] transition-all duration-300";

  const labelClass =
    "block text-white/40 text-label-sm font-semibold uppercase tracking-[0.15em] mb-2.5";

  const primaryBtnClass =
    "w-full py-3 rounded-lg text-white font-bold text-title-md transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden group";

  function ErrorBanner({ message }: { message: string }) {
    return (
      <div
        className="flex items-center gap-2.5 px-4 py-3 rounded-lg border"
        style={{
          backgroundColor: "rgba(var(--accent-rgb), 0.08)",
          borderColor: "rgba(var(--accent-rgb), 0.2)",
        }}
      >
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "rgba(var(--accent-rgb), 0.2)" }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <p className="text-[#E8A0A0] text-sm">{message}</p>
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
      <main className="flex min-h-screen" style={{ backgroundColor: "#0D1B2A" }}>
        {/* ── Left Panel: Decorative ─────────────────────────────── */}
        <div
          className="hidden lg:flex lg:w-[48%] xl:w-[52%] relative overflow-hidden items-center justify-center"
          style={{
            background: "linear-gradient(160deg, #0A1628 0%, #0D1B2A 40%, #111F33 100%)",
          }}
        >
          {/* Noise texture overlay */}
          <div
            className="absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
              backgroundSize: "128px 128px",
            }}
          />

          {/* Subtle grid */}
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: "60px 60px",
            }}
          />

          {/* Radial glow behind gears */}
          <div
            className="absolute w-[500px] h-[500px] rounded-full"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              background: "radial-gradient(circle, rgba(var(--accent-rgb),0.12) 0%, transparent 65%)",
              animation: "gradient-shift 6s ease-in-out infinite",
            }}
          />

          {/* Animated gear rings */}
          <div className="relative w-[400px] h-[400px]">
            <GearRing
              radius={180}
              teeth={32}
              toothDepth={12}
              toothWidth={18}
              strokeColor="rgba(var(--accent-rgb), 0.12)"
              duration={120}
              reverse={false}
            />
            <GearRing
              radius={130}
              teeth={24}
              toothDepth={10}
              toothWidth={16}
              strokeColor="rgba(255, 255, 255, 0.06)"
              duration={90}
              reverse={true}
            />
            <GearRing
              radius={80}
              teeth={16}
              toothDepth={8}
              toothWidth={14}
              strokeColor="rgba(var(--accent-rgb), 0.08)"
              duration={60}
              reverse={false}
            />
            <GearRing
              radius={40}
              teeth={10}
              toothDepth={6}
              toothWidth={12}
              strokeColor="rgba(255, 255, 255, 0.04)"
              duration={45}
              reverse={true}
            />

            {/* Center dot */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
              style={{ backgroundColor: "rgba(var(--accent-rgb), 0.3)" }}
            />
          </div>

          {/* Floating particles */}
          <Particle x={15} y={20} size={3} delay={0} />
          <Particle x={75} y={15} size={2} delay={1.5} />
          <Particle x={85} y={70} size={4} delay={3} />
          <Particle x={20} y={80} size={2} delay={4.5} />
          <Particle x={60} y={90} size={3} delay={2} />
          <Particle x={40} y={10} size={2} delay={5} />

          {/* Brand content overlay */}
          <div className="absolute bottom-16 left-12 right-12 z-10">
            <img
              src={brand.logo}
              alt={brand.logoAlt}
              className="h-10 mb-6 opacity-80"
            />
            <p className="text-white/25 text-body-md leading-relaxed max-w-[320px]">
              {brand.description}
            </p>
          </div>

          {/* Right edge accent line */}
          <div
            className="absolute right-0 top-0 bottom-0 w-px"
            style={{
              background:
                "linear-gradient(to bottom, transparent, rgba(var(--accent-rgb), 0.2) 30%, rgba(var(--accent-rgb), 0.3) 50%, rgba(var(--accent-rgb), 0.2) 70%, transparent)",
            }}
          />
        </div>

        {/* ── Right Panel: Form ──────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center px-6 py-12 relative">
          {/* Mobile background effects */}
          <div
            className="lg:hidden absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-15 blur-[100px]"
            style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
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
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                <span className="text-white/30 text-label-sm font-semibold uppercase tracking-[0.2em]">
                  {brand.portalTitle}
                </span>
              </div>
            </div>

            {/* ── Card ─────────────────────────────────────────────── */}
            <div
              className="rounded-2xl p-8 sm:p-10"
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
                      className={`${primaryBtnClass} btn-primary mt-1`}
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
                      className={`${primaryBtnClass} btn-primary mt-1`}
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
                      className={`${primaryBtnClass} btn-primary mt-1`}
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
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                      style={{
                        backgroundColor: "rgba(34, 197, 94, 0.08)",
                        border: "1px solid rgba(34, 197, 94, 0.15)",
                      }}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                      className={`${primaryBtnClass} btn-primary`}
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
