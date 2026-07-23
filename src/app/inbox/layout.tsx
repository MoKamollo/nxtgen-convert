import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Inbox",
  description: "Manage all incoming messages and notifications in one unified inbox.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
