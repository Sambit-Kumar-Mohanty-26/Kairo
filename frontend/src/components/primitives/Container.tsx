import React from "react";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

/**
 * Disciplined 12-column editorial layout container
 * Max width: 1440px
 * Horizontal padding: clamp(24px, 4vw, 72px)
 */
export default function Container({
  children,
  className = "",
  as: Component = "div",
}: ContainerProps) {
  return (
    <Component
      className={`w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-[clamp(24px,4vw,72px)] ${className}`}
    >
      {children}
    </Component>
  );
}
