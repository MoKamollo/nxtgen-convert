import Navbar from "./_landing/Navbar";
import Hero from "./_landing/Hero";
import Modules from "./_landing/Modules";
import Showcase from "./_landing/Showcase";
import Comparison from "./_landing/Comparison";
import Testimonials from "./_landing/Testimonials";
import Pricing from "./_landing/Pricing";
import FAQ from "./_landing/FAQ";
import CTA from "./_landing/CTA";
import Footer from "./_landing/Footer";

export const metadata = {
  title: "NxtGen Convert — Revenue OS for Affiliate Marketers",
  description:
    "Track affiliate links, funnels, email sequences, and contacts in one dashboard. Built for operators who run email-first and affiliate businesses.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ink-950 text-white">
      <Navbar />
      <main>
        <Hero />
        <Modules />
        <Showcase />
        <Comparison />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
