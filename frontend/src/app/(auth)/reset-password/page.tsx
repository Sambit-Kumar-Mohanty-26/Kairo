"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowLeft } from "lucide-react";
import PasswordField from "@/components/auth/PasswordField";
import { resetPassword } from "@/lib/auth";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (password.length < 8) next.password = "Password must be at least 8 characters.";
    if (confirm !== password) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      await resetPassword(token, password);
      // reset-password signs you straight in — no reason to ask for the
      // password you just chose one field ago
      router.push("/dashboard");
    } catch (err) {
      setErrors({ password: err instanceof Error ? err.message : "Something went wrong." });
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="font-serif text-[30px] sm:text-[34px] leading-[1.05] tracking-tight text-[#171917]">
            This link is incomplete.
          </h1>
          <p className="text-[14.5px] leading-relaxed text-[#62665F] max-w-[36ch]">
            Reset links expire after an hour and can only be used once. Request a new one.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="inline-flex items-center gap-2 text-[13.5px] font-medium text-[#171917] w-fit border-b border-[#171917]/30 hover:border-[#171917] transition-colors duration-200"
        >
          Send another link
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Access // 04 — New Password
        </span>
        <h1 className="font-serif text-[34px] sm:text-[40px] leading-[1.05] tracking-tight text-[#171917]">
          Choose a new one.
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] max-w-[34ch]">
          Setting a new password signs out every other device on your account.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <PasswordField
          label="New password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={errors.password ? undefined : "8 characters minimum"}
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />

        <button
          type="submit"
          disabled={loading}
          className="h-[46px] inline-flex items-center justify-center gap-2 rounded-full bg-[#171917] text-[#FFFFEB] text-sm font-semibold tracking-tight shadow-xs hover:shadow-sm hover:-translate-y-0.5 transition-all group disabled:opacity-60 disabled:pointer-events-none"
        >
          <span>{loading ? "Saving…" : "Set new password"}</span>
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

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary or the whole route opts out of
  // static rendering at build time
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
