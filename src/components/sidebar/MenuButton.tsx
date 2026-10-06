"use client";

import { useSidebar } from "./SidebarContext";

/** Hamburger that opens the command sidebar. Sits at the left of SysHeader. */
export default function MenuButton() {
  const { toggle } = useSidebar();
  return (
    <button
      onClick={toggle}
      aria-label="Open menu"
      style={{
        display: "grid",
        placeItems: "center",
        width: 30,
        height: 30,
        border: "1px solid var(--color-line)",
        flex: "none",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect x="2" y="3.5" width="12" height="1.6" fill="var(--acc)" />
        <rect x="2" y="7.2" width="12" height="1.6" fill="currentColor" />
        <rect x="2" y="10.9" width="8" height="1.6" fill="currentColor" />
      </svg>
    </button>
  );
}
