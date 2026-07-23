import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your NxtGen Convert workspace.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
