import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Deals",
  description: "Track your sales pipeline and manage every deal from lead to close.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
