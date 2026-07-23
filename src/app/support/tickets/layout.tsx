import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Support",
  description: "Track and resolve customer support tickets across your team.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
