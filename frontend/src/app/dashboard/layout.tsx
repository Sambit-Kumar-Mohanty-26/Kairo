import React from "react";
import DemoProvider from "@/components/dashboard/DemoProvider";
import DashboardShell from "@/components/dashboard/DashboardShell";

/* Guarded: DemoProvider calls me() on mount and bounces to /login if it
   fails, so nothing below it ever renders for a logged-out tab. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider>
      <DashboardShell>{children}</DashboardShell>
    </DemoProvider>
  );
}
