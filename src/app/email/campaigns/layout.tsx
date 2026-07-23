import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Email Campaigns",
  description: "Build, send, and track email campaigns to your contacts and segments.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
