import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NxtGen Convert",
    template: "%s | NxtGen Convert",
  },
  description:
    "The smart CRM and revenue platform for modern businesses. Manage contacts, deals, campaigns, and growth metrics in one place.",
  keywords: ["CRM", "contacts", "deals", "campaigns", "NPS", "revenue", "NxtGen Convert"],
  applicationName: "NxtGen Convert",
  openGraph: {
    title: "NxtGen Convert",
    description: "Smart CRM and revenue platform for modern businesses.",
    siteName: "NxtGen Convert",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "NxtGen Convert",
    description: "Smart CRM and revenue platform for modern businesses.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Instrument+Sans:ital,wght@0,400..700;1,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
