/**
 * The lock screen's own loading state — deliberately empty. Without it, the root
 * loading.tsx (an app-shell skeleton with the sidebar and tab bar) streams first,
 * briefly showing a not-yet-unlocked visitor the app's menu structure.
 */
export default function LockLoading() {
  return <main style={{ minHeight: "100dvh", background: "var(--color-bg)" }} />;
}
