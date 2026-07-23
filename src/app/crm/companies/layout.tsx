import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Companies",
  description: "View and manage all companies and accounts linked to your contacts.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
