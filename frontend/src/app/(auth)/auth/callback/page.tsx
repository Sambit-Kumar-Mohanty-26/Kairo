"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { googleExchange } from "@/lib/auth";

/* React remounts effects in development, and the effect below scrubs the hash
   on its first run, so a second run would find nothing there and report a
   failure over a sign-in still in flight. Read the handoff once, outside the
   component, and let the remount see the same values. */
let handoff: URLSearchParams | null = null;
let started = false;

/**
 * Where Google lands, by way of this app's own /api/auth/google/callback.
 *
 * The code arrives in the URL *fragment*, which is never sent to a server, so
 * it stays out of access logs and Referer headers. The exchange for a session
 * happens here over fetch rather than as a redirect through the API, so a
 * cold-starting backend shows this screen instead of its host's own.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [failed, setFailed] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!handoff) {
      handoff = new URLSearchParams(window.location.hash.slice(1));
      // Scrub before anything awaits: a spent code in history is still a code.
      window.history.replaceState(null, "", window.location.pathname);
    }

    const code = handoff.get("code");
    if (!code) {
      setFailed(handoff.get("error") ?? "Google sign-in didn't complete.");
      return;
    }
    if (started) return; // a code is good for exactly one exchange
    started = true;

    const hint = setTimeout(() => setSlow(true), 5_000);
    googleExchange(code)
      .then(() => router.replace("/dashboard"))
      .catch((e: unknown) =>
        setFailed(e instanceof Error ? e.message : "Google sign-in didn't complete."),
      )
      .finally(() => clearTimeout(hint));
  }, [router]);

  if (!failed) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#8A8E86]">
          Signing you in&hellip;
        </p>
        {/* Honest about the wait rather than looking hung. Only after five
            seconds, so a warm backend never shows it. */}
        {slow && (
          <p className="text-[13.5px] leading-relaxed text-[#B0B4AC] max-w-[34ch]">
            Waking the service. First sign-in after a quiet spell can take up to a minute.
          </p>
        )}
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
