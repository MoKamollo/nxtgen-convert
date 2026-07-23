import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Contacts",
  description: "Manage and track all your contacts, leads, prospects, and customers in one place.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
