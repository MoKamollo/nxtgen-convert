import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Tasks",
  description: "Stay on top of your to-dos and follow-ups with a unified task list.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
