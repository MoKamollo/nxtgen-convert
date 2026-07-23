import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "AI Insights",
  description: "AI-powered recommendations and insights to grow your revenue faster.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
