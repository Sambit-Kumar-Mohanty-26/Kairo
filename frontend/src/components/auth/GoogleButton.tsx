"use client";

import React from "react";
import GoogleGlyph from "./GoogleGlyph";

/**
 * Not wired to a provider yet — there is no backend in this repo to hand a
 * token to. Swap onClick for the real call (NextAuth `signIn("google")`,
 * Supabase `signInWithOAuth`, etc.) once one exists; the button itself is
 * done.
 */
export default function GoogleButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-pill-paper w-full !py-3 !gap-3 justify-center"
    >
      <GoogleGlyph />
      <span>{label}</span>
    </button>
  );
}
