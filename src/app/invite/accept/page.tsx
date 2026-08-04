"use client";

import { apiFetch } from "@/lib/org";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function InvitationCard({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#04080F] p-6 text-[#F8FAFC]">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-[#080F1E] p-6">
        <h1 className="text-xl font-bold">NxtGen Convert invitation</h1>
        <p className="mt-3 text-sm text-[#94A3B8]">{message}</p>
      </section>
    </main>
  );
}

function AcceptInvitationContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("Validating your invitation…");
  const token = params.get("token") ?? "";

  useEffect(() => {
    if (!token) return;

    let active = true;

    async function acceptInvitation() {
      try {
        const response = await apiFetch("/api/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!active) return;

        if (response.status === 401) {
          const next = encodeURIComponent(`/invite/accept?token=${token}`);
          router.replace(`/login?next=${next}`);
          return;
        }

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Invitation could not be accepted");
        }

        if (active && data.redirect) router.replace(data.redirect);
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Invitation could not be accepted");
        }
      }
    }

    void acceptInvitation();

    return () => {
      active = false;
    };
  }, [router, token]);

  return <InvitationCard message={token ? message : "The invitation link is incomplete."} />;
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<InvitationCard message="Validating your invitation…" />}>
      <AcceptInvitationContent />
    </Suspense>
  );
}
