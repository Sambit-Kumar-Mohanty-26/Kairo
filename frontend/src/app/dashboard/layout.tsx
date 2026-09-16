import React from "react";
import DemoProvider from "@/components/dashboard/DemoProvider";
import DashboardShell from "@/components/dashboard/DashboardShell";

/* ponytail: deliberately unguarded. The auth guard goes back on when asked —
   one me() call in DemoProvider, nothing else changes. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider>
      <DashboardShell>{children}</DashboardShell>
    </DemoProvider>
  );
}
