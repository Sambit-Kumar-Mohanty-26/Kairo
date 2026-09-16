"use client";

import React, { useState } from "react";
import { NetworkNodeData } from "./types";

interface NetworkNodeProps {
  node: NetworkNodeData;
  onHover?: (node: NetworkNodeData | null) => void;
}

export default function NetworkNode({ node, onHover }: NetworkNodeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const isAlert = node.state === "alert";

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      className="cursor-pointer group"
      onMouseEnter={() => {
        setIsHovered(true);
        onHover?.(node);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onHover?.(null);
      }}
    >
      {/* Node Ping Pulse on Alert */}
      {isAlert && (
        <circle r="14" fill="none" stroke="#E11D48" strokeWidth="1">
          <animate attributeName="r" values="8;18;24" dur="2s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.8;0.3;0" dur="2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Target Halo on Hover */}
      <circle
        r={isHovered ? "12" : "8"}
        fill="#FFFFEB"
        stroke={isAlert ? "#E11D48" : "#171917"}
        strokeWidth={isHovered ? "1.5" : "1"}
        strokeOpacity={isHovered ? "0.9" : "0.3"}
        className="transition-all duration-200"
      />

      {/* Center Core Dot */}
      <circle
        r={isHovered ? "3.5" : "2.5"}
        fill={isAlert ? "#E11D48" : node.state === "active" ? "#059669" : "#62665F"}
        className="transition-all duration-200"
      />

      {/* Node Monospace Annotation */}
      <text
        x="0"
        y="-14"
        textAnchor="middle"
        fill="#171917"
        className={`font-mono text-[9px] uppercase tracking-wider font-semibold transition-opacity duration-200 ${
          isHovered || isAlert ? "opacity-100" : "opacity-40"
        }`}
      >
        {node.label}
      </text>

      {/* Coordinates / Telemetry Subtext on Hover */}
      {isHovered && (
        <g transform="translate(0, 18)" className="animate-in fade-in duration-150">
          <rect
            x="-35"
            y="0"
            width="70"
            height="14"
            rx="3"
            fill="#111413"
          />
          <text
            x="0"
            y="10"
            textAnchor="middle"
            fill="#FFFFFF"
            className="font-mono text-[8px] uppercase tracking-widest"
          >
            {node.sublabel || `0x${node.id.slice(0, 4)}`}
          </text>
        </g>
      )}
    </g>
  );
}
