import Link from "next/link";

const LINKS = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
  ],
  Account: [
    { label: "Sign in", href: "/login" },
    { label: "Create account", href: "/sign-up" },
  ],
  Legal: [
    { label: "Transparency", href: "https://nxtgen-stack.com/transparency-affiliate-disclosure/" },
    { label: "Legal inquiries", href: "mailto:hello@nxtgen-stack.com" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-ink-950 py-16">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div className="sm:col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <div style={{ width: 100, height: 20, overflow: "hidden" }}>
                <img src="/nxg-logo-dark.svg" alt="NxtGen" style={{ height: 20, width: "auto" }} />
              </div>
              <span className="text-xs font-semibold tracking-widest text-violet-300 uppercase">
                Convert
              </span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-mist-500">
              Revenue operations for affiliate and email-driven businesses.
            </p>
          </div>

          {Object.entries(LINKS).map(([section, items]) => (
            <div key={section}>
              <h3 className="mb-3 font-mono text-[10px] font-semibold tracking-[0.2em] text-mist-600">
                {section.toUpperCase()}
              </h3>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href}
                      className="text-sm text-mist-500 transition-colors hover:text-mist-200">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-white/[0.05] pt-8 sm:flex-row sm:items-center">
          <p className="text-xs text-mist-700">
            &copy; {new Date().getFullYear()} NxtGen Convert. All rights reserved.
          </p>
          <p className="text-xs text-mist-700">
            Part of the <span className="text-mist-500">NxtGen Stack</span> platform.
          </p>
        </div>
      </div>
    </footer>
  );
}
