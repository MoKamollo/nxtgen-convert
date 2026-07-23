import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Settings",
  description: "Configure your workspace, team, integrations, and growth tracking settings.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
