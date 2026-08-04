import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NxtGen Convergence",
    template: "%s | NxtGen Convergence",
  },
  description:
    "The smart CRM and revenue platform for modern businesses. Manage contacts, deals, campaigns, and growth metrics in one place.",
  keywords: ["CRM", "contacts", "deals", "campaigns", "NPS", "revenue", "NxtGen Convergence"],
  applicationName: "NxtGen Convergence",
  openGraph: {
    title: "NxtGen Convergence",
    description: "Smart CRM and revenue platform for modern businesses.",
    siteName: "NxtGen Convergence",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "NxtGen Convergence",
    description: "Smart CRM and revenue platform for modern businesses.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
