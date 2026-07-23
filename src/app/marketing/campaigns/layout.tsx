import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Marketing",
  description: "Run and monitor all your marketing campaigns and track their performance.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
