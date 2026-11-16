import React from "react";
import Link from "next/link";
import Navbar from "@/components/navigation/Navbar";
import SiteFooter from "@/components/footer/SiteFooter";
import { ArrowLeft, Shield } from "lucide-react";

export const metadata = {
  title: "Privacy Policy · Kairo",
  description: "Privacy commitments and zero-payload data handling principles governing Kairo.",
};

export default function PrivacyPage() {
  return (
    <div className="relative min-h-screen bg-[#FFFFEB] text-[#171917] selection:bg-[#E4D4F8] selection:text-[#171917]">
      <Navbar />

      <main className="max-w-4xl mx-auto px-6 sm:px-8 pt-36 pb-24">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#62665F] hover:text-[#171917] transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Overview
        </Link>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#E4D4F8] flex items-center justify-center text-[#171917]">
            <Shield className="w-4 h-4" />
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#62665F]">
            Data Governance & Privacy
          </span>
        </div>

        <h1 className="font-serif text-[40px] sm:text-[48px] leading-[1.08] tracking-tight text-[#171917] mb-6">
          Privacy Policy
        </h1>
        <p className="font-mono text-[12px] text-[#8A8E86] mb-12">
          Effective Date: November 16, 2026 · Version 1.2
        </p>

        <div className="space-y-10 text-[15px] text-[#2C302B] leading-relaxed">
          <section className="border-t border-[#E8E8D8] pt-8">
            <h2 className="font-serif text-[22px] text-[#171917] mb-3">1. The Zero-Payload Principle</h2>
            <p>
              Kairo is engineered from the ground up as a statistical network behavior engine, not a deep packet inspector.
              Edge sensors inspect headers solely to compute flow summary metrics (such as inter-arrival timing std, packet length
              variances, and window byte sizes). Payload bytes, URLs, unencrypted query parameters, and application contents are
              immediately dropped at the edge network interface and are never transmitted, buffered, or written to disk.
            </p>
          </section>

          <section className="border-t border-[#E8E8D8] pt-8">
            <h2 className="font-serif text-[22px] text-[#171917] mb-3">2. Information We Process</h2>
            <ul className="list-disc pl-5 space-y-2 text-[#3D403A]">
              <li><strong>Account Credentials:</strong> Email, organization name, role, and cryptographically salted password hashes (Argon2id).</li>
              <li><strong>Aggregated Network Telemetry:</strong> 30 statistical flow features per completed network session.</li>
              <li><strong>Diagnostic Telemetry:</strong> Interface heartbeat metrics (packets received, queue depth, drop counters) for appliance health monitoring.</li>
            </ul>
          </section>

          <section className="border-t border-[#E8E8D8] pt-8">
            <h2 className="font-serif text-[22px] text-[#171917] mb-3">3. Data Retention & Isolation</h2>
            <p>
              Multi-tenant telemetry is isolated strictly by cryptographic Organization IDs. Live detection telemetry is maintained
              in write-ahead partitioned stores and automatically pruned based on customer retention policy (default: 30 days).
              Audit logs and forensic reports remain exportable on demand via authenticated dashboard controls.
            </p>
          </section>

          <section className="border-t border-[#E8E8D8] pt-8">
            <h2 className="font-serif text-[22px] text-[#171917] mb-3">4. Security & Compliance</h2>
            <p>
              All transit communications require TLS 1.3 with modern forward-secrecy cipher suites. Databases and persistent volumes
              utilize AES-256 encryption at rest. Refresh tokens are secured with HttpOnly, SameSite=Lax flags, preventing script-based
              token exfiltration. Kairo adheres to FERPA, HIPAA, and GDPR standards for enterprise zero-payload telemetry inspection.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
