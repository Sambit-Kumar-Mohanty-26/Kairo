"use client";

import React from "react";
import { ScenarioType } from "./types";

interface FlowLayerProps {
  scenario: ScenarioType;
}

/**
 * Kairo Flow Replay Layer — Cinematic Light Theme
 * 
 * Design Principles:
 * - Fixed physical network backbone stays identical across all scenarios
 * - Only flow BEHAVIOR changes (color, cadence, density, path emphasis)
 * - Gradient conduits with depth, not flat lines
 * - Luminous animated packet trains with trails
 * - Ambient dot-grid texture in the background
 * - Rich SVG filters for light-compatible glow effects
 */
export default function FlowLayer({ scenario }: FlowLayerProps) {
  const isNormal = scenario === "NORMAL";
  const isDDoS = scenario === "DDOS";
  const isPortScan = scenario === "PORTSCAN";
  const isBruteForce = scenario === "BRUTEFORCE";
  const isBotnet = scenario === "BOTNET";

  return (
    <g className="flow-layer select-none pointer-events-none">
      <defs>
        {/* ===== GRADIENT CONDUIT DEFINITIONS ===== */}
        <linearGradient id="conduit-normal" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#D4D4C4" />
          <stop offset="50%" stopColor="#C8C8B4" />
          <stop offset="100%" stopColor="#D4D4C4" />
        </linearGradient>

        <linearGradient id="conduit-threat-red" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FECDD3" />
          <stop offset="50%" stopColor="#FDA4AF" />
          <stop offset="100%" stopColor="#FECDD3" />
        </linearGradient>

        <linearGradient id="conduit-threat-amber" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FEF3C7" />
          <stop offset="50%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#FEF3C7" />
        </linearGradient>

        {/* ===== GLOW & SHADOW FILTERS ===== */}
        {/* Soft emerald glow for normal packets */}
        <filter id="glow-green" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feFlood floodColor="#059669" floodOpacity="0.25" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Rich crimson glow for threat packets */}
        <filter id="glow-red" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#E11D48" floodOpacity="0.3" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Warm amber glow for recon packets */}
        <filter id="glow-amber" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#D97706" floodOpacity="0.3" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Conduit depth shadow */}
        <filter id="conduit-shadow" x="-10%" y="-30%" width="120%" height="160%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#171917" floodOpacity="0.06" />
        </filter>

        {/* Ambient dot-grid pattern */}
        <pattern id="ambient-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="0.7" fill="#C8C8B4" opacity="0.5" />
        </pattern>
      </defs>

      {/* ===== AMBIENT DOT-GRID BACKGROUND TEXTURE ===== */}
      <rect x="0" y="0" width="960" height="480" fill="url(#ambient-grid)" />

      {/* ===== PHYSICAL CONDUIT BACKBONE (Same in all scenarios) ===== */}
      {/* Each conduit uses a gradient fill with subtle depth shadow */}

      {/* WAN Ingress Link */}
      <path
        d={`M 80,120 L ${isDDoS ? "180" : "112"},120`}
        stroke={isDDoS ? "#FDA4AF" : "#B8B8A8"}
        strokeWidth={isDDoS ? "5" : "2.5"}
        strokeLinecap="round"
        strokeDasharray={isDDoS ? "none" : "4 4"}
        filter="url(#conduit-shadow)"
        className="transition-all duration-700"
      />

      {/* Route 1: EDGE-GW01 (248, 120) → Decision Core (480, 240) */}
      <path
        d="M 248,120 C 340,140 400,200 480,240"
        stroke={isDDoS ? "url(#conduit-threat-red)" : "url(#conduit-normal)"}
        strokeWidth={isDDoS ? "5" : "3.5"}
        strokeLinecap="round"
        fill="none"
        filter="url(#conduit-shadow)"
        className="transition-all duration-700"
      />

      {/* Route 2: BLR-PROBE (248, 360) → Decision Core (480, 240) */}
      <path
        d="M 248,360 C 340,340 400,280 480,240"
        stroke={isPortScan ? "url(#conduit-threat-amber)" : isBotnet ? "url(#conduit-threat-red)" : "url(#conduit-normal)"}
        strokeWidth={isPortScan || isBotnet ? "5" : "3.5"}
        strokeLinecap="round"
        fill="none"
        filter="url(#conduit-shadow)"
        className="transition-all duration-700"
      />

      {/* Route 3: Decision Core (480, 240) → APP SERVER (712, 100) */}
      <path
        d="M 480,240 C 560,200 640,140 712,100"
        stroke={isPortScan ? "url(#conduit-threat-amber)" : "url(#conduit-normal)"}
        strokeWidth={isPortScan ? "4.5" : "3.5"}
        strokeLinecap="round"
        fill="none"
        filter="url(#conduit-shadow)"
        className="transition-all duration-700"
      />

      {/* Route 4: Decision Core (480, 240) → SSH BASTION (712, 240) */}
      <path
        d="M 480,240 L 712,240"
        stroke={isBruteForce ? "url(#conduit-threat-red)" : isPortScan ? "url(#conduit-threat-amber)" : "url(#conduit-normal)"}
        strokeWidth={isBruteForce ? "5" : isPortScan ? "4.5" : "3.5"}
        strokeLinecap="round"
        filter="url(#conduit-shadow)"
        className="transition-all duration-700"
      />

      {/* Route 5: Decision Core (480, 240) → CORE DB (712, 380) */}
      <path
        d="M 480,240 C 560,280 640,340 712,380"
        stroke={isPortScan ? "url(#conduit-threat-amber)" : "url(#conduit-normal)"}
        strokeWidth={isPortScan ? "4.5" : "3.5"}
        strokeLinecap="round"
        fill="none"
        filter="url(#conduit-shadow)"
        className="transition-all duration-700"
      />

      {/* ===== ANIMATED PACKET TRAIN BEHAVIORS ===== */}

      {/* NORMAL: Calm, evenly-spaced emerald data packets with luminous trails */}
      {isNormal && (
        <>
          {/* Gateway → Core */}
          {[0, 0.7, 1.4, 2.1].map((delay, idx) => (
            <circle key={`n-gw-${idx}`} r={idx === 0 ? "5.5" : "4.5"} fill="#059669" filter="url(#glow-green)">
              <animateMotion
                dur="2.6s"
                begin={`${delay}s`}
                repeatCount="indefinite"
                path="M 248,120 C 340,140 400,200 480,240"
              />
            </circle>
          ))}
          {/* Probe → Core */}
          {[0.3, 1.2, 2.0].map((delay, idx) => (
            <circle key={`n-pr-${idx}`} r={idx === 0 ? "5.5" : "4.5"} fill="#059669" filter="url(#glow-green)">
              <animateMotion
                dur="2.7s"
                begin={`${delay}s`}
                repeatCount="indefinite"
                path="M 248,360 C 340,340 400,280 480,240"
              />
            </circle>
          ))}
          {/* Core → App Server */}
          {[0.2, 1.1].map((delay, idx) => (
            <circle key={`n-app-${idx}`} r="4" fill="#059669" filter="url(#glow-green)">
              <animateMotion
                dur="2.3s"
                begin={`${delay}s`}
                repeatCount="indefinite"
                path="M 480,240 C 560,200 640,140 712,100"
              />
            </circle>
          ))}
          {/* Core → SSH Bastion */}
          <circle r="4" fill="#059669" filter="url(#glow-green)">
            <animateMotion dur="2.2s" begin="0.6s" repeatCount="indefinite" path="M 480,240 L 712,240" />
          </circle>
          {/* Core → DB */}
          {[0.5, 1.6].map((delay, idx) => (
            <circle key={`n-db-${idx}`} r="4" fill="#059669" filter="url(#glow-green)">
              <animateMotion
                dur="2.5s"
                begin={`${delay}s`}
                repeatCount="indefinite"
                path="M 480,240 C 560,280 640,340 712,380"
              />
            </circle>
          ))}
        </>
      )}

      {/* DDOS: Massive high-frequency crimson torrent on ingress path */}
      {isDDoS && (
        <g>
          {/* Torrential WAN feed */}
          {[0, 0.12, 0.24, 0.36, 0.48, 0.6].map((delay, idx) => (
            <circle key={`d-wan-${idx}`} r="5.5" fill="#E11D48" filter="url(#glow-red)">
              <animateMotion
                dur="0.5s"
                begin={`${delay}s`}
                repeatCount="indefinite"
                path="M 80,120 L 180,120"
              />
            </circle>
          ))}
          {/* Heavy surge into Decision Core */}
          {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((delay, idx) => (
            <circle key={`d-pipe-${idx}`} r="6" fill="#E11D48" filter="url(#glow-red)">
              <animateMotion
                dur="0.85s"
                begin={`${delay * 0.85}s`}
                repeatCount="indefinite"
                path="M 248,120 C 340,140 400,200 480,240"
              />
            </circle>
          ))}
          {/* Volumetric Annotation */}
          <g transform="translate(350, 155)">
            <rect x="-45" y="-11" width="90" height="22" rx="5" fill="#FFF1F2" stroke="#E11D48" strokeWidth="1.25" />
            <text x="0" y="3" textAnchor="middle" fill="#E11D48" fontSize="9" fontFamily="monospace" fontWeight="bold">
              FLOW SURGE
            </text>
          </g>
          {/* Protected downstream: calm normal packets */}
          <circle r="4" fill="#059669" filter="url(#glow-green)">
            <animateMotion dur="2.5s" begin="0.3s" repeatCount="indefinite" path="M 480,240 C 560,200 640,140 712,100" />
          </circle>
          <circle r="4" fill="#059669" filter="url(#glow-green)">
            <animateMotion dur="2.6s" begin="0.8s" repeatCount="indefinite" path="M 480,240 C 560,280 640,340 712,380" />
          </circle>
        </g>
      )}

      {/* PORT SCAN: Sequential amber reconnaissance sweeping to servers */}
      {isPortScan && (
        <g>
          {/* Recon probes from Branch Sensor */}
          {[0, 0.5, 1.0, 1.5].map((delay, idx) => (
            <circle key={`ps-src-${idx}`} r="5.5" fill="#D97706" filter="url(#glow-amber)">
              <animateMotion
                dur="1.6s"
                begin={`${delay}s`}
                repeatCount="indefinite"
                path="M 248,360 C 340,340 400,280 480,240"
              />
            </circle>
          ))}
          {/* Fan-out to each server with staggered timing */}
          <circle r="5" fill="#D97706" filter="url(#glow-amber)">
            <animateMotion dur="1.4s" begin="0.1s" repeatCount="indefinite" path="M 480,240 C 560,200 640,140 712,100" />
          </circle>
          <circle r="5" fill="#D97706" filter="url(#glow-amber)">
            <animateMotion dur="1.3s" begin="0.45s" repeatCount="indefinite" path="M 480,240 L 712,240" />
          </circle>
          <circle r="5" fill="#D97706" filter="url(#glow-amber)">
            <animateMotion dur="1.4s" begin="0.8s" repeatCount="indefinite" path="M 480,240 C 560,280 640,340 712,380" />
          </circle>
          {/* Targeted port annotations */}
          <g transform="translate(855, 100)">
            <text x="0" y="3" fill="#D97706" fontSize="9" fontFamily="monospace" fontWeight="bold" opacity="0.85">[:80 :443]</text>
          </g>
          <g transform="translate(855, 240)">
            <text x="0" y="3" fill="#D97706" fontSize="9" fontFamily="monospace" fontWeight="bold" opacity="0.85">[:21 :22]</text>
          </g>
          <g transform="translate(855, 380)">
            <text x="0" y="3" fill="#D97706" fontSize="9" fontFamily="monospace" fontWeight="bold" opacity="0.85">[:5432]</text>
          </g>
        </g>
      )}

      {/* BRUTE FORCE: Rapid repeated bursts targeting SSH Bastion */}
      {isBruteForce && (
        <g>
          {/* Normal baseline on other paths */}
          <circle r="4" fill="#059669" filter="url(#glow-green)">
            <animateMotion dur="2.5s" begin="0.2s" repeatCount="indefinite" path="M 480,240 C 560,200 640,140 712,100" />
          </circle>
          <circle r="4" fill="#059669" filter="url(#glow-green)">
            <animateMotion dur="2.7s" begin="0.6s" repeatCount="indefinite" path="M 480,240 C 560,280 640,340 712,380" />
          </circle>
          {/* High-cadence auth bursts to Bastion */}
          {[0, 0.16, 0.32, 0.48, 0.64, 0.8].map((delay, idx) => (
            <circle key={`bf-${idx}`} r="5.5" fill="#E11D48" filter="url(#glow-red)">
              <animateMotion
                dur="0.8s"
                begin={`${delay}s`}
                repeatCount="indefinite"
                path="M 480,240 L 712,240"
              />
            </circle>
          ))}
          {/* Auth attempt badge */}
          <g transform="translate(600, 218)">
            <rect x="-45" y="-11" width="90" height="22" rx="5" fill="#FFF1F2" stroke="#E11D48" strokeWidth="1.25" />
            <text x="0" y="3" textAnchor="middle" fill="#E11D48" fontSize="9" fontFamily="monospace" fontWeight="bold">
              AUTH BURST
            </text>
          </g>
        </g>
      )}

      {/* BOTNET: Coordinated synchronized beaconing from multiple ingress */}
      {isBotnet && (
        <g>
          {/* Synchronized periodic ingress from both sources */}
          {[0, 0.7, 1.4].map((delay, idx) => (
            <g key={`bot-sync-${idx}`}>
              <circle r="5.5" fill="#E11D48" filter="url(#glow-red)">
                <animateMotion
                  dur="1.8s"
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                  path="M 248,120 C 340,140 400,200 480,240"
                />
              </circle>
              <circle r="5.5" fill="#E11D48" filter="url(#glow-red)">
                <animateMotion
                  dur="1.8s"
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                  path="M 248,360 C 340,340 400,280 480,240"
                />
              </circle>
            </g>
          ))}
          {/* Downstream continues normally */}
          <circle r="4" fill="#059669" filter="url(#glow-green)">
            <animateMotion dur="2.4s" begin="0.3s" repeatCount="indefinite" path="M 480,240 C 560,200 640,140 712,100" />
          </circle>
          <circle r="4" fill="#059669" filter="url(#glow-green)">
            <animateMotion dur="2.6s" begin="0.7s" repeatCount="indefinite" path="M 480,240 C 560,280 640,340 712,380" />
          </circle>
          {/* C2 Synchronization Badge */}
          <g transform="translate(350, 258)">
            <rect x="-48" y="-11" width="96" height="22" rx="5" fill="#FFF1F2" stroke="#E11D48" strokeWidth="1.25" />
            <text x="0" y="3" textAnchor="middle" fill="#E11D48" fontSize="9" fontFamily="monospace" fontWeight="bold">
              PERIODIC C2
            </text>
          </g>
        </g>
      )}
    </g>
  );
}
