"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    // Fetch session to determine role and redirect
    const res = await fetch("/api/auth/session");
    const session = await res.json();
    const role = session?.user?.role;

    const redirectMap: Record<string, string> = {
      accountant: "/accountant/dashboard",
      admin: "/admin/dashboard",
      employee: "/employee/dashboard",
    };

    router.push(redirectMap[role] ?? "/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0F172A]">
      <div className="w-full max-w-sm px-8 py-10 rounded-2xl bg-[#1E293B] shadow-2xl">
        {/* Logo placeholder */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-indigo-500 flex items-center justify-center">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <span className="text-white text-xl font-semibold tracking-tight">
              Autosettle
            </span>
          </div>
        </div>

        <h1 className="text-white text-2xl font-semibold text-center mb-1">
          Welcome back
        </h1>
        <p className="text-slate-400 text-sm text-center mb-8">
          Sign in to your account
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-300 text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#0F172A] border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              placeholder="you@firm.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="text-slate-300 text-sm font-medium"
              htmlFor="password"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#0F172A] border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm transition"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
