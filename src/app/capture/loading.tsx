export default function Loading() {
  // Capture is a focused full-screen flow (its own header, no tab bar).
  return (
    <div className="app-shell">
      <main className="app-main" style={{ paddingBottom: 24 }}>
        <div className="sk" style={{ height: 32, marginBottom: 14 }} aria-hidden /> {/* header row */}
        <div className="sk" style={{ height: 226, marginBottom: 12 }} aria-hidden /> {/* recorder */}
        <div className="sk" style={{ height: 9, width: 170, marginBottom: 8 }} aria-hidden />
        <div className="sk" style={{ height: 180, marginBottom: 14 }} aria-hidden /> {/* textarea */}
        <div style={{ display: "flex", gap: 8 }}>
          <div className="sk" style={{ height: 46, flex: 1 }} aria-hidden />
          <div className="sk" style={{ height: 46, flex: 1 }} aria-hidden />
        </div>
      </main>
    </div>
  );
}
