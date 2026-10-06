import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import SysHeader from "@/components/SysHeader";
import SettingsScreen from "@/components/SettingsScreen";
import { requireSpace } from "@/lib/space";
import { pinUpdatedAt } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const space = await requireSpace();
  // From the decoy this route simply does not exist — same 404 a stranger would get
  // for any made-up path, so probing it reveals nothing.
  if (space !== "private") notFound();

  const updated = await pinUpdatedAt();

  return (
    <AppShell>
      <SysHeader sub="ACCESS" />
      <SettingsScreen updated={updated} />
    </AppShell>
  );
}
