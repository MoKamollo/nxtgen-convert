import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your NxtGen Convergence account and start growing your revenue.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
