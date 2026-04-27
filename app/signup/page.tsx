"use client";

import { useState, useEffect, useRef } from "react";
import { brand } from '@/config/branding';

interface Firm {
  id: string;
  name: string;
}

type PageState = "idle" | "loading" | "verify" | "verifying" | "success";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firmId, setFirmId] = useState("");
  const [firmSearch, setFirmSearch] = useState("");
  const [firms, setFirms] = useState<Firm[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState("");
  const [pageState, setPageState] = useState<PageState>("idle");
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Verification
  const [userId, setUserId] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    setMounted(true);
    fetch("/api/firms/public")
      .then((res) => res.json())
      .then((res) => {
        if (res.data) setFirms(res.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredFirms = firms.filter((f) =>
    f.name.toLowerCase().includes(firmSearch.toLowerCase())
  );

  function selectFirm(firm: Firm) {
    setFirmId(firm.id);
    setFirmSearch(firm.name);
    setShowDropdown(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name || !email || !phone || !password || !confirmPassword || !firmId) {
      setError("All fields are required");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setPageState("loading");

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, password, firmId }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Something went wrong");
        setPageState("idle");
        return;
      }

      setUserId(data.data.userId);
      setPageState("verify");
      startCooldown();
    } catch {
      setError("Something went wrong. Please try again.");
      setPageState("idle");
    }
  }

  // ─── Code input handling ───────────────────────────────────────────────
  function handleCodeChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    if (value && index < 5) codeRefs.current[index + 1]?.focus();
    if (value && index === 5 && newCode.every((d) => d)) verifyCode(newCode.join(""));
  }
  function handleCodeKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[index] && index > 0) codeRefs.current[index - 1]?.focus();
  }
  function handleCodePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      codeRefs.current[5]?.focus();
      verifyCode(pasted);
    }
  }

  async function verifyCode(codeStr: string) {
    setError("");
    setPageState("verifying");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: codeStr }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Invalid code");
        setCode(["", "", "", "", "", ""]);
        codeRefs.current[0]?.focus();
        setPageState("verify");
        return;
      }
      setPageState("success");
    } catch {
      setError("Verification failed. Please try again.");
      setPageState("verify");
    }
  }

  function startCooldown() {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((prev) => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; });
    }, 1000);
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError("");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "resend" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Failed to resend"); return; }
      startCooldown();
      setCode(["", "", "", "", "", ""]);
      codeRefs.current[0]?.focus();
    } catch { setError("Failed to resend. Please try again."); }
  }

  const inputClass =
    "w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/20 text-title-md focus:outline-none focus:ring-2 focus:ring-[rgba(var(--primary-rgb),0.4)] focus:border-[rgba(var(--primary-rgb),0.2)] focus:bg-white/[0.06] transition-all duration-300";

  const labelClass =
    "block text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2.5";

  return (
    <div>
      <main
        className="min-h-screen flex items-center justify-center relative overflow-hidden"
        style={{ backgroundColor: "var(--primary)" }}
      >
        {/* Subtle grid background */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />

        {/* Gradient glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-20 blur-[120px]"
          style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)" }}
        />

        <div
          className="relative w-full max-w-[440px] mx-4 my-8"
          style={{
            opacity: mounted ? 1 : 0,
            transition: "opacity 0.4s ease-out",
          }}
        >
          {/* Logo */}
          <div className="flex items-center justify-center mb-10">
            <img src={brand.logo} alt={brand.logoAlt} className="h-12" />
          </div>

          {/* Card */}
          <div
            className="p-8 sm:p-10"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              boxShadow: "0 8px 40px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
            }}
          >
            {pageState === "success" ? (
              <div className="form-stagger" key="success">
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
                  <h2 className="text-white text-[26px] font-extrabold tracking-tight mb-2">
                    Email verified!
                  </h2>
                  <p className="text-white/35 text-title-sm leading-relaxed mb-8 max-w-xs mx-auto">
                    Your account has been created. Please wait for your admin to approve your access before you can log in.
                  </p>
                  <a
                    href="/login"
                    className="inline-flex items-center gap-2 text-body-md text-white/50 hover:text-white font-medium transition-colors duration-300 underline decoration-white/20 underline-offset-2 hover:decoration-white/50"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                    Back to sign in
                  </a>
                </div>
              </div>
            ) : (pageState === "verify" || pageState === "verifying") ? (
              <div className="text-center" key="verify">
                <div className="mb-6">
                  <h2 className="text-white text-[26px] font-extrabold tracking-tight mb-1.5">
                    Verify your email
                  </h2>
                  <p className="text-white/35 text-title-sm">
                    We sent a 6-digit code to <span className="text-white/60">{email}</span>
                  </p>
                </div>
                <div className="flex justify-center gap-2.5 mb-6" onPaste={handleCodePaste}>
                  {code.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { codeRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(i, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(i, e)}
                      disabled={pageState === "verifying"}
                      className="w-12 h-14 text-center text-xl font-bold text-white bg-white/[0.04] border border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--primary-rgb),0.4)] focus:bg-white/[0.06] transition-all disabled:opacity-40"
                    />
                  ))}
                </div>
                {pageState === "verifying" && (
                  <p className="text-white/40 text-sm mb-4">Verifying...</p>
                )}
                {error && (
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <p style={{ color: "var(--reject-red)" }} className="text-sm">{error}</p>
                  </div>
                )}
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className="text-white/40 hover:text-white/70 text-sm transition-colors disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                </button>
              </div>
            ) : (
              <div className="form-stagger" key="signup">
                <div className="mb-8">
                  <h1 className="text-white text-[26px] font-extrabold tracking-tight mb-1.5">
                    Create account
                  </h1>
                  <p className="text-white/35 text-title-sm">
                    Sign up as an employee to get started
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                  <div>
                    <label className={labelClass} htmlFor="name">
                      Full name
                    </label>
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <input
                        id="name"
                        type="text"
                        required
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={`${inputClass} login-input pl-11`}
                        placeholder="John Doe"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass} htmlFor="signup-email">
                      Email address
                    </label>
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="4" width="20" height="16" rx="2" />
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                      </div>
                      <input
                        id="signup-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`${inputClass} login-input pl-11`}
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass} htmlFor="phone">
                      Phone number
                    </label>
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                          <line x1="12" y1="18" x2="12.01" y2="18" />
                        </svg>
                      </div>
                      <input
                        id="phone"
                        type="tel"
                        required
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`${inputClass} login-input pl-11`}
                        placeholder="+60123456789"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass} htmlFor="signup-password">
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
                        id="signup-password"
                        type="password"
                        required
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${inputClass} login-input pl-11`}
                        placeholder="Min. 8 characters"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass} htmlFor="signup-confirm">
                      Confirm password
                    </label>
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                      </div>
                      <input
                        id="signup-confirm"
                        type="password"
                        required
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`${inputClass} login-input pl-11`}
                        placeholder="Re-enter password"
                      />
                    </div>
                  </div>

                  {/* Firm dropdown */}
                  <div ref={dropdownRef}>
                    <label className={labelClass} htmlFor="firm">
                      Firm
                    </label>
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20 z-10 pointer-events-none">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                      </div>
                      <input
                        id="firm"
                        type="text"
                        required
                        autoComplete="off"
                        value={firmSearch}
                        onChange={(e) => {
                          setFirmSearch(e.target.value);
                          setFirmId("");
                          setShowDropdown(true);
                        }}
                        onFocus={() => setShowDropdown(true)}
                        className={`${inputClass} login-input pl-11`}
                        placeholder="Search for your firm..."
                      />
                      {showDropdown && filteredFirms.length > 0 && (
                        <div
                          className="absolute z-20 w-full mt-1.5 max-h-48 overflow-y-auto border shadow-2xl"
                          style={{
                            backgroundColor: "var(--primary)",
                            borderColor: "rgba(255, 255, 255, 0.08)",
                            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4)",
                          }}
                        >
                          {filteredFirms.map((firm) => (
                            <button
                              key={firm.id}
                              type="button"
                              onClick={() => selectFirm(firm)}
                              className="w-full text-left px-4 py-3 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors duration-200"
                            >
                              {firm.name}
                            </button>
                          ))}
                        </div>
                      )}
                      {showDropdown && firmSearch && filteredFirms.length === 0 && (
                        <div
                          className="absolute z-20 w-full mt-1.5 border px-4 py-3"
                          style={{
                            backgroundColor: "var(--primary)",
                            borderColor: "rgba(255, 255, 255, 0.08)",
                          }}
                        >
                          <p className="text-white/30 text-sm">No firms found</p>
                        </div>
                      )}
                    </div>
                    <p className="text-white/20 text-label-sm mt-2 leading-relaxed">
                      Contact your manager or admin if you&apos;re unsure which firm to choose.
                    </p>
                  </div>

                  {error && (
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
                      <p style={{ color: "var(--reject-red)" }} className="text-sm">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={pageState === "loading"}
                    className="w-full py-3 text-white font-bold text-title-md transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed btn-thick-navy mt-1"
                  >
                    {pageState === "loading" ? (
                      <span className="flex items-center justify-center gap-2.5">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Creating account...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        Create account
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14" />
                          <path d="m12 5 7 7-7 7" />
                        </svg>
                      </span>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Sign in link */}
          <p
            className="text-center text-white/25 text-body-md mt-8"
            style={{
              opacity: mounted ? 1 : 0,
              animation: mounted ? "fade-in-up 0.5s ease-out 0.6s both" : "none",
            }}
          >
            Already have an account?{" "}
            <a
              href="/login"
              className="text-white/50 hover:text-white font-medium transition-colors duration-300 underline decoration-white/20 underline-offset-2 hover:decoration-white/50"
            >
              Sign in
            </a>
            <br />
            <span className="text-white/15">Are you an accountant?{" "}</span>
            <a
              href="/signup/accountant"
              className="text-white/50 hover:text-white font-medium transition-colors duration-300 underline decoration-white/20 underline-offset-2 hover:decoration-white/50"
            >
              Create your firm
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
