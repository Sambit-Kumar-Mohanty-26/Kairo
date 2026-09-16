"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import KairoWordmark from "@/components/brand/KairoWordmark";
import { me, logout, type User } from "@/lib/auth";

/**
 * ponytail: a landing place, not the product. It exists so the auth loop has
 * somewhere to end and so a bad token visibly bounces you back to /login.
 * Replace with the real console when detections have a UI.
 */
export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    me()
      .then(setUser)
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FFFFEB] flex items-center justify-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#8A8E86]">
          Loading…
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFFEB] text-[#171917] flex flex-col">
      <header className="flex items-center justify-between px-6 sm:px-10 py-6 border-b border-[#DCDDCB]">
        <KairoWordmark size={22} showSubtitle />
        <button
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8A8E86] hover:text-[#171917] transition-colors duration-200"
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="flex flex-col gap-4 max-w-[440px]">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#059669]">
            {user.organization.name} // {user.role}
          </span>
          <h1 className="font-serif text-[34px] sm:text-[40px] leading-[1.05] tracking-tight">
            You&rsquo;re in, {user.full_name ?? user.email}.
          </h1>
          <p className="text-[14.5px] leading-relaxed text-[#62665F]">
            Nothing is connected yet. Once a network source is feeding Kairo, its
            detections land here.
          </p>
        </div>
      </main>
    </div>
  );
}
