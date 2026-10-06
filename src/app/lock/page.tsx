import type { Metadata } from "next";
import PinPad from "@/components/PinPad";

export const dynamic = "force-dynamic";

// Generic on purpose: the tab title a stranger sees says nothing about a journal.
export const metadata: Metadata = {
  title: "LifeOS",
  description: "",
};

export default function LockPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "calc(var(--safe-top) + 24px) 20px calc(var(--safe-bottom) + 24px)",
        background:
          "radial-gradient(120% 80% at 50% 0%, rgba(255,98,0,0.06) 0%, rgba(5,5,5,0) 58%), var(--color-bg)",
      }}
    >
      <PinPad />
    </main>
  );
}
