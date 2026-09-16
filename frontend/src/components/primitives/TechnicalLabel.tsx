import React from "react";

interface TechnicalLabelProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "accent" | "muted";
  size?: "xs" | "sm" | "base";
  className?: string;
}

export default function TechnicalLabel({
  children,
  variant = "secondary",
  size = "sm",
  className = "",
}: TechnicalLabelProps) {
  const variantStyles = {
    primary: "text-[#171917]",
    secondary: "text-[#62665F]",
    accent: "text-[#059669]",
    muted: "text-[#8A8E86]",
  };

  const sizeStyles = {
    xs: "text-[10px] tracking-wider uppercase",
    sm: "text-[12px] tracking-wide",
    base: "text-[13px]",
  };

  return (
    <span
      className={`font-mono font-normal inline-block ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {children}
    </span>
  );
}
