"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Fades and lifts its children the first time they scroll into view, once.
 * The global prefers-reduced-motion rule in globals.css collapses the
 * transition duration, so this degrades to a plain appearance automatically.
 */
export default function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "-8% 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: seen ? 1 : 0,
        transform: seen ? "none" : "translateY(22px)",
        filter: seen ? "none" : "blur(5px)",
        transition:
          "opacity 1s var(--ease-cinematic), transform 1s var(--ease-cinematic), filter 1s var(--ease-cinematic)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
