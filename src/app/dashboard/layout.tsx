import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Dashboard",
  description: "Revenue overview based on recorded subscriptions, pipeline activity, NPS responses, and customer operations.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
