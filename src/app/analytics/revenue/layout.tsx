import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Analytics",
  description: "Deep-dive into your revenue metrics, conversion funnel, and growth trends.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
