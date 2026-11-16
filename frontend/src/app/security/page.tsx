import React from "react";
import Link from "next/link";
import Navbar from "@/components/navigation/Navbar";
import SiteFooter from "@/components/footer/SiteFooter";
import { ArrowLeft, Lock } from "lucide-react";

export const metadata = {
  title: "Security & Trust · Kairo",
  description: "Enterprise security architecture, cryptographic integrity standards, and vulnerability reporting.",
};

export default function SecurityPage() {
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
            <Lock className="w-4 h-4" />
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#62665F]">
            Infrastructure & Assurance
          </span>
        </div>

        <h1 className="font-serif text-[40px] sm:text-[48px] leading-[1.08] tracking-tight text-[#171917] mb-6">
          Security Overview
        </h1>
        <p className="font-mono text-[12px] text-[#8A8E86] mb-12">
          Architecture Trust Model · Continuous Verification
        </p>

        <div className="space-y-10 text-[15px] text-[#2C302B] leading-relaxed">
          <section className="border-t border-[#E8E8D8] pt-8">
            <h2 className="font-serif text-[22px] text-[#171917] mb-3">1. Defense-in-Depth Authentication</h2>
            <p>
              Session management uses short-lived JWT access tokens (15-minute validity) paired with cryptographic
              opaque refresh tokens rotated upon each issue. Refresh tokens are secured within <code className="bg-[#EAEAD8] px-1.5 py-0.5 rounded text-[13px] font-mono">HttpOnly; Secure; SameSite=Lax</code> cookies,
              mitigating Cross-Site Scripting (XSS) credential theft. Role-Based Access Control (RBAC) enforces principle-of-least-privilege
              separation across Owner, Admin, Analyst, and Sensor roles.
            </p>
          </section>

          <section className="border-t border-[#E8E8D8] pt-8">
            <h2 className="font-serif text-[22px] text-[#171917] mb-3">2. Machine Learning Supply Chain Integrity</h2>
            <p>
              To guard against model tampering and pickle deserialization exploits, Kairo requires pre-execution SHA-256
              cryptographic integrity verification. Served model artifacts are hashed and compared against trusted digests
              prior to unpickling. Model deployments are managed via an immutable registry with candidate validation gates
              and automated canary rollback.
            </p>
          </section>

          <section className="border-t border-[#E8E8D8] pt-8">
            <h2 className="font-serif text-[22px] text-[#171917] mb-3">3. Sensor-to-Backend Mutual Authentication</h2>
            <p>
              Each deployed sensor authenticates with the ingestion gateway using high-entropy SHA-256 hashed API keys.
              Internal microservices communicate over isolated networks governed by dedicated bearer tokens (<code className="bg-[#EAEAD8] px-1.5 py-0.5 rounded text-[13px] font-mono">KAIRO_ML_TOKEN</code>)
              and strict CORS origin whitelisting, preventing cross-tenant and third-party script forging.
            </p>
          </section>

          <section className="border-t border-[#E8E8D8] pt-8">
            <h2 className="font-serif text-[22px] text-[#171917] mb-3">4. Vulnerability Disclosure</h2>
            <p>
              We welcome coordinated security vulnerability reports. If you discover a potential vulnerability within
              Kairo core, edge agents, or ingestion gateways, please report it directly to <span className="font-mono text-[13px] text-[#171917] font-semibold">security@kairo.network</span>.
              Reports are acknowledged within 24 hours with remediation timelines prioritized according to CVSS severity.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
