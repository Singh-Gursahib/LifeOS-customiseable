import { currentSpace } from "@/lib/space";
import TabBar from "./TabBar";
import { SidebarProvider } from "./sidebar/SidebarContext";
import SidebarDrawer from "./sidebar/SidebarDrawer";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  // The sidebar carries one extra control in the private space. Resolving the space
  // here, on the server, means the decoy's HTML never even contains it.
  const space = await currentSpace();
  return (
    <SidebarProvider>
      <div className="app-shell">
        <main className="app-main">{children}</main>
        <TabBar />
      </div>
      <SidebarDrawer isPrivate={space === "private"} />
    </SidebarProvider>
  );
}
