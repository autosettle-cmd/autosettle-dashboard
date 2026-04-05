"use client";

import { useState, useEffect, useRef } from "react";
import { brand } from '@/config/branding';

interface Firm {
  id: string;
  name: string;
}

type PageState = "idle" | "loading" | "success";

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

      setPageState("success");
    } catch {
      setError("Something went wrong. Please try again.");
      setPageState("idle");
    }
  }

  const inputClass =
    "w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/20 text-title-md focus:outline-none focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.4)] focus:border-[rgba(var(--accent-rgb),0.2)] focus:bg-white/[0.06] transition-all duration-300";

  const labelClass =
    "block text-white/40 text-label-sm font-semibold uppercase tracking-[0.15em] mb-2.5";

  return (
    <div>
      <main
        className="min-h-screen flex items-center justify-center relative overflow-hidden"
        style={{ backgroundColor: "#0D1B2A" }}
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
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
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
            className="rounded-2xl p-8 sm:p-10"
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
                  <h2 className="text-white text-[26px] font-extrabold tracking-tight mb-2">
                    Account created
                  </h2>
                  <p className="text-white/35 text-title-sm leading-relaxed mb-8 max-w-xs mx-auto">
                    Your account has been created. Please wait for your admin to approve your access. You will be notified once approved.
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
                          className="absolute z-20 w-full mt-1.5 max-h-48 overflow-y-auto rounded-xl border shadow-2xl"
                          style={{
                            backgroundColor: "var(--sidebar)",
                            borderColor: "rgba(255, 255, 255, 0.08)",
                            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4)",
                          }}
                        >
                          {filteredFirms.map((firm) => (
                            <button
                              key={firm.id}
                              type="button"
                              onClick={() => selectFirm(firm)}
                              className="w-full text-left px-4 py-3 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl"
                            >
                              {firm.name}
                            </button>
                          ))}
                        </div>
                      )}
                      {showDropdown && firmSearch && filteredFirms.length === 0 && (
                        <div
                          className="absolute z-20 w-full mt-1.5 rounded-xl border px-4 py-3"
                          style={{
                            backgroundColor: "var(--sidebar)",
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
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl border"
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
                      <p className="text-[#E8A0A0] text-sm">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={pageState === "loading"}
                    className="w-full py-3 rounded-xl text-white font-bold text-title-md transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed btn-primary mt-1"
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
          </p>
        </div>
      </main>
    </div>
  );
}
