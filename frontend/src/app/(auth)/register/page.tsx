"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import FormField from "@/components/auth/FormField";
import PasswordField from "@/components/auth/PasswordField";
import GoogleButton from "@/components/auth/GoogleButton";
import Divider from "@/components/auth/Divider";
import { register, googleUrl } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<{
    organization?: string;
    password?: string;
    confirm?: string;
    email?: string;
    agree?: string;
  }>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!organization.trim()) next.organization = "Enter your organization's name.";
    if (!email.includes("@")) next.email = "Enter a valid email address.";
    if (password.length < 8) next.password = "Password must be at least 8 characters.";
    if (confirm !== password) next.confirm = "Passwords don't match.";
    if (!agreed) next.agree = "Accept the terms to continue.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      await register(email, password, organization.trim());
      router.push("/dashboard");
    } catch (err) {
      // a taken address is the one register error the user can act on, so it
      // belongs on the email field rather than in a generic banner
      setErrors({ email: err instanceof Error ? err.message : "Something went wrong." });
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
          Kairo Access // 02 — Create Account
        </span>
        <h1 className="font-serif text-[30px] sm:text-[34px] leading-[1.05] tracking-tight text-[#171917]">
          Set up Kairo.
        </h1>
        <p className="text-[14px] leading-snug text-[#62665F] max-w-[34ch]">
          One account covers every office, network, and sensor you connect.
        </p>
      </div>

      <GoogleButton label="Sign up with Google" onClick={() => { window.location.href = googleUrl(); }} />
      <Divider label="or with email" />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          label="Organization"
          autoComplete="organization"
          placeholder="Acme Technologies"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          error={errors.organization}
          hint={errors.organization ? undefined : "Appears on every alert. Renameable in Settings."}
        />
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <PasswordField
          label="Password"
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

        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#171917] shrink-0"
          />
          <span className="text-[13px] leading-snug text-[#62665F]">
            I agree to the{" "}
            <Link href="/terms" className="text-[#171917] border-b border-[#171917]/30 hover:border-[#171917]">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-[#171917] border-b border-[#171917]/30 hover:border-[#171917]">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {errors.agree && (
          <span className="font-mono text-[10.5px] text-[#E11D48] -mt-4">{errors.agree}</span>
        )}

        <button
          type="submit"
          disabled={loading}
          className="h-[46px] inline-flex items-center justify-center gap-2 rounded-full bg-[#171917] text-[#FFFFEB] text-sm font-semibold tracking-tight shadow-xs hover:shadow-sm hover:-translate-y-0.5 transition-all group disabled:opacity-60 disabled:pointer-events-none"
        >
          <span>{loading ? "Creating account…" : "Create account"}</span>
          {!loading && (
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          )}
        </button>
      </form>

      <p className="text-center text-[13.5px] text-[#62665F]">
        Already have an account?{" "}
        <Link href="/login" className="text-[#171917] font-medium border-b border-[#171917]/30 hover:border-[#171917] transition-colors duration-200">
          Sign in
        </Link>
      </p>
    </div>
  );
}
