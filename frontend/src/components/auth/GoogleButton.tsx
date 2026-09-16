"use client";

import React from "react";
import GoogleGlyph from "./GoogleGlyph";

/**
 * Sends the browser to the backend's /auth/google/start, which hands off to
 * Google and redirects back to /auth/callback with tokens in the fragment.
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
