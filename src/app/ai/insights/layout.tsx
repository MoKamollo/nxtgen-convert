import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Operational Signals",
  description: "Explainable operational signals derived from current NxtGen Convergence records.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
