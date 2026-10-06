import AppShell from "@/components/AppShell";
import SysHeader from "@/components/SysHeader";
import AskScreen from "@/components/AskScreen";

export default function AskPage() {
  return (
    <AppShell>
      <SysHeader sub="ASK — VAULT ARCHIVIST" />
      <AskScreen />
    </AppShell>
  );
}
