"use client";

import { useState, useEffect, useRef } from "react";

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
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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

      <div className="relative w-full max-w-[440px] mx-4 my-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#A60201' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-white text-[22px] font-bold tracking-tight">Autosettle</span>
        </div>

        {/* Card */}
        <div className="bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] rounded-xl p-8">
          {pageState === "success" ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-white text-xl font-semibold mb-2">Account Created</h2>
              <p className="text-white/50 text-sm">Your account has been created. Please wait for your admin to approve your access. You will be notified once approved.</p>
              <a href="/login" className="inline-block mt-6 text-sm text-white/60 hover:text-white underline">Back to login</a>
            </div>
          ) : (
            <>
              <h1 className="text-white text-xl font-semibold mb-1">Create account</h1>
              <p className="text-white/40 text-sm mb-7">Sign up to get started</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div>
                  <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2" htmlFor="name">
                    Full name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#A60201]/50 focus:border-[#A60201]/30 transition-all"
                    placeholder="John Doe"
                  />
                </div>

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
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2" htmlFor="phone">
                    Phone number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#A60201]/50 focus:border-[#A60201]/30 transition-all"
                    placeholder="+60123456789"
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
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#A60201]/50 focus:border-[#A60201]/30 transition-all"
                    placeholder="Min. 8 characters"
                  />
                </div>

                <div>
                  <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2" htmlFor="confirmPassword">
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#A60201]/50 focus:border-[#A60201]/30 transition-all"
                    placeholder="Re-enter password"
                  />
                </div>

                {/* Firm dropdown */}
                <div ref={dropdownRef}>
                  <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2" htmlFor="firm">
                    Firm
                  </label>
                  <div className="relative">
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
                      className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#A60201]/50 focus:border-[#A60201]/30 transition-all"
                      placeholder="Search for your firm..."
                    />
                    {showDropdown && filteredFirms.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto rounded-lg bg-[#1B2B3F] border border-white/[0.1] shadow-lg">
                        {filteredFirms.map((firm) => (
                          <button
                            key={firm.id}
                            type="button"
                            onClick={() => selectFirm(firm)}
                            className="w-full text-left px-3.5 py-2.5 text-sm text-white/80 hover:bg-white/[0.08] transition-colors"
                          >
                            {firm.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {showDropdown && firmSearch && filteredFirms.length === 0 && (
                      <div className="absolute z-10 w-full mt-1 rounded-lg bg-[#1B2B3F] border border-white/[0.1] shadow-lg px-3.5 py-2.5">
                        <p className="text-white/40 text-sm">No firms found</p>
                      </div>
                    )}
                  </div>
                  <p className="text-white/30 text-xs mt-2">
                    Not sure which firm to choose? Contact your manager or admin for the correct firm name.
                  </p>
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
                  disabled={pageState === "loading"}
                  className="w-full py-2.5 rounded-lg text-white font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-[#A60201]/25"
                  style={{ backgroundColor: pageState === "loading" ? '#6B1413' : '#A60201' }}
                >
                  {pageState === "loading" ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating account...
                    </span>
                  ) : (
                    "Create account"
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-white/30 text-sm mt-6">
          Already have an account?{' '}
          <a href="/login" className="text-white/60 hover:text-white underline transition-colors">Sign in</a>
        </p>
      </div>
    </main>
  );
}
