import React from "react";
import Navbar from "@/components/navigation/Navbar";
import Hero from "@/components/hero/Hero";
import SignalTransformationSection from "@/components/sections/SignalTransformationSection";
import DetectionSection from "@/components/sections/DetectionSection";
import InvestigationSection from "@/components/sections/InvestigationSection";
import TestModeSection from "@/components/sections/TestModeSection";
import NetworkFabricSection from "@/components/sections/NetworkFabricSection";
import ResearchSection from "@/components/sections/ResearchSection";
import SiteFooter from "@/components/footer/SiteFooter";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-[#FFFFEB] text-[#171917] selection:bg-[#E4D4F8] selection:text-[#171917] overflow-x-clip">
      <div id="top" />

      {/* Floating Tactical Navigation Capsule */}
      <Navbar />

      {/* Flagship Hero Experience */}
      <main>
        <Hero />

        {/* Section 02: From Traffic to Understanding */}
        <SignalTransformationSection />

        {/* Section 03: Detect What Matters */}
        <DetectionSection />

        {/* Section 04: From Alert to Understanding */}
        <InvestigationSection />

        {/* Section 05: Test Kairo */}
        <TestModeSection />

        {/* Section 06: One Intelligence Layer. Every Network. */}
        <NetworkFabricSection />

        {/* Section 07: The Intelligence Behind Kairo */}
        <ResearchSection />

      </main>

      <SiteFooter />
    </div>
  );
}
