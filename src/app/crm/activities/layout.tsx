import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Activities",
  description: "Log calls, emails, meetings, and notes for every contact and deal.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
