"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { storeSession } from "@/lib/auth";

/**
 * Where Google lands after the backend has verified the id_token.
 *
 * The tokens arrive in the URL *fragment*, not the query string: a fragment is
 * never sent to a server, so it stays out of access logs and Referer headers.
 * Read it, store it, and scrub it from history before anything else runs.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (!access_token || !refresh_token) {
      setFailed(params.get("error") ?? "Google sign-in didn't complete.");
      return;
    }

    storeSession({ access_token, refresh_token });
    window.history.replaceState(null, "", window.location.pathname);
    router.replace("/dashboard");
  }, [router]);

  if (!failed) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#8A8E86]">
        Signing you in…
      </p>
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
