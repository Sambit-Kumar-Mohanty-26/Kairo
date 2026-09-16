"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import FormField from "@/components/auth/FormField";
import PasswordField from "@/components/auth/PasswordField";
import GoogleButton from "@/components/auth/GoogleButton";
import Divider from "@/components/auth/Divider";

// TODO: point this at whichever backend/auth provider ends up wired in
// (NextAuth, Supabase, a plain API route) — the form itself is ready.
function submitLogin(email: string, password: string) {
  return new Promise<void>((resolve) => setTimeout(resolve, 900));
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setError(null);
    setLoading(true);
    await submitLogin(email, password);
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Access // 01 — Sign In
        </span>
        <h1 className="font-serif text-[34px] sm:text-[40px] leading-[1.05] tracking-tight text-[#171917]">
          Welcome back.
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] max-w-[34ch]">
          Sign in to monitor, investigate, and act on what Kairo sees.
        </p>
      </div>

      <GoogleButton label="Continue with Google" />
      <Divider label="or with email" />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          labelAction={
            <Link
              href="/forgot-password"
              className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8A8E86] hover:text-[#171917] transition-colors duration-200"
            >
              Forgot password?
            </Link>
          }
          error={error ?? undefined}
        />

        <button
          type="submit"
          disabled={loading}
          className="h-[46px] inline-flex items-center justify-center gap-2 rounded-full bg-[#171917] text-[#FFFFEB] text-sm font-semibold tracking-tight shadow-xs hover:shadow-sm hover:-translate-y-0.5 transition-all group disabled:opacity-60 disabled:pointer-events-none"
        >
          <span>{loading ? "Signing in…" : "Sign in"}</span>
          {!loading && (
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          )}
        </button>
      </form>

      <p className="text-center text-[13.5px] text-[#62665F]">
        New to Kairo?{" "}
        <Link href="/register" className="text-[#171917] font-medium border-b border-[#171917]/30 hover:border-[#171917] transition-colors duration-200">
          Create an account
        </Link>
      </p>
    </div>
  );
}
