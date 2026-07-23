import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Automations",
  description: "Automate repetitive tasks and set up workflows triggered by contact actions.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
