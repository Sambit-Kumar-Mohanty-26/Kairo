"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft, MailCheck } from "lucide-react";
import FormField from "@/components/auth/FormField";

// TODO: wire to a real provider once one exists.
function submitReset(email: string) {
  return new Promise<void>((resolve) => setTimeout(resolve, 900));
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return setError("Enter a valid email address.");
    setError(null);
    setLoading(true);
    await submitReset(email);
    setLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex flex-col gap-6">
        <div className="w-11 h-11 rounded-full bg-[#F0E8F8] flex items-center justify-center">
          <MailCheck className="w-5 h-5 text-[#171917]" />
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="font-serif text-[30px] sm:text-[34px] leading-[1.05] tracking-tight text-[#171917]">
            Check your inbox.
          </h1>
          <p className="text-[14.5px] leading-relaxed text-[#62665F] max-w-[36ch]">
            If an account exists for <span className="text-[#171917]">{email}</span>, a reset
            link is on its way.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-[13.5px] font-medium text-[#171917] w-fit border-b border-[#171917]/30 hover:border-[#171917] transition-colors duration-200"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Access // 03 — Reset
        </span>
        <h1 className="font-serif text-[34px] sm:text-[40px] leading-[1.05] tracking-tight text-[#171917]">
          Reset your password.
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] max-w-[34ch]">
          Enter the email on your account and we&rsquo;ll send a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error ?? undefined}
        />

        <button
          type="submit"
          disabled={loading}
          className="h-[46px] inline-flex items-center justify-center gap-2 rounded-full bg-[#171917] text-[#FFFFEB] text-sm font-semibold tracking-tight shadow-xs hover:shadow-sm hover:-translate-y-0.5 transition-all group disabled:opacity-60 disabled:pointer-events-none"
        >
          <span>{loading ? "Sending…" : "Send reset link"}</span>
          {!loading && (
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          )}
        </button>
      </form>

      <Link
        href="/login"
        className="inline-flex items-center gap-2 text-[13.5px] font-medium text-[#171917] w-fit border-b border-[#171917]/30 hover:border-[#171917] transition-colors duration-200"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to sign in
      </Link>
    </div>
  );
}
