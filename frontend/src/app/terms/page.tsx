import React from "react";
import Link from "next/link";
import Navbar from "@/components/navigation/Navbar";
import SiteFooter from "@/components/footer/SiteFooter";
import { ArrowLeft, FileText } from "lucide-react";

export const metadata = {
  title: "Terms of Service · Kairo",
  description: "Terms and conditions governing the deployment and usage of Kairo network telemetry services.",
};

export default function TermsPage() {
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
            <FileText className="w-4 h-4" />
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#62665F]">
            Legal Agreements
          </span>
        </div>

        <h1 className="font-serif text-[40px] sm:text-[48px] leading-[1.08] tracking-tight text-[#171917] mb-6">
          Terms of Service
        </h1>
        <p className="font-mono text-[12px] text-[#8A8E86] mb-12">
          Effective Date: November 16, 2026 · Version 1.2
        </p>

        <div className="space-y-10 text-[15px] text-[#2C302B] leading-relaxed">
          <section className="border-t border-[#E8E8D8] pt-8">
            <h2 className="font-serif text-[22px] text-[#171917] mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing the Kairo platform, registering an enterprise tenant, or executing edge telemetry agents,
              you agree to be bound by these Terms of Service. If you are entering into this agreement on behalf of
              an enterprise, institution, or university, you represent that you have authority to bind the entity.
            </p>
          </section>

          <section className="border-t border-[#E8E8D8] pt-8">
            <h2 className="font-serif text-[22px] text-[#171917] mb-3">2. Permitted Sensor Deployment</h2>
            <p>
              Kairo sensors may only be deployed across network segments, interfaces, and mirrored TAP ports where the
              operator possesses explicit administrative authority and legal consent to monitor traffic metadata. Unauthorized
              monitoring, TAP interception across external unauthorized infrastructure, or malicious credential reuse is strictly
              prohibited and constitutes grounds for immediate account termination.
            </p>
          </section>

          <section className="border-t border-[#E8E8D8] pt-8">
            <h2 className="font-serif text-[22px] text-[#171917] mb-3">3. Service Levels & Ingestion Guarantees</h2>
            <p>
              Kairo implements distributed backpressure shedding, automated circuit-breakers, and edge SQLite WAL durable
              queues. While designed for zero data loss during transient network partitions up to local edge queue capacity (default: 50 MB),
              prolonged outages exceeding local storage quotas or deliberate denial-of-service against telemetry ingestion endpoints
              may result in rate-limited flow shedding (HTTP 429 Retry-After) to maintain system stability.
            </p>
          </section>

          <section className="border-t border-[#E8E8D8] pt-8">
            <h2 className="font-serif text-[22px] text-[#171917] mb-3">4. Limitation of Liability</h2>
            <p>
              Kairo provides automated heuristic and probabilistic machine learning threat detection. Because network threat
              landscapes evolve continuously, detections represent statistical likelihoods rather than absolute warranties.
              Organizations are advised to corroborate automated risk scores with internal network security operations procedures.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
