"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { googleExchange, storeSession } from "@/lib/auth";

let handoff: URLSearchParams | null = null;
let started = false;

export default function AuthCallbackPage() {
  const router = useRouter();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!handoff) {
      handoff = new URLSearchParams(window.location.hash.slice(1));
      window.history.replaceState(null, "", window.location.pathname);
    }

    // Fast-path: tokens already exchanged server-to-server (Nexum architecture)
    const accessToken = handoff.get("access_token");
    const refreshToken = handoff.get("refresh_token");
    if (accessToken && refreshToken) {
      storeSession({ access_token: accessToken, refresh_token: refreshToken });
      router.replace("/dashboard");
      return;
    }

    const errorMsg = handoff.get("error");
    if (errorMsg) {
      setFailed(errorMsg);
      return;
    }

    // Fallback: client exchange if raw code arrived directly
    const code = handoff.get("code");
    if (!code) {
      setFailed("Google sign-in didn't complete.");
      return;
    }
    if (started) return;
    started = true;

    googleExchange(code)
      .then(() => router.replace("/dashboard"))
      .catch((e: unknown) =>
        setFailed(e instanceof Error ? e.message : "Google sign-in didn't complete."),
      );
  }, [router]);

  if (!failed) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#8A8E86]">
          Signing you in&hellip;
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-serif text-[30px] sm:text-[34px] leading-[1.05] tracking-tight text-[#171917]">
          That didn&rsquo;t go through.
        </h1>
        <p className="text-[14.5px] leading-relaxed text-[#62665F] max-w-[36ch]">{failed}</p>
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
