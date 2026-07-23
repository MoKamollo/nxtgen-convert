import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Calendar",
  description: "Schedule and view all your meetings, calls, and follow-up activities.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
