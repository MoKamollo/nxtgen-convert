import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your real-time revenue overview — MRR, ARR, pipeline, NPS, CAC, LTV and more.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
