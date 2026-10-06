import MenuButton from "./sidebar/MenuButton";

export default function SysHeader({ sub = "PERSONAL TELEMETRY" }: { sub?: string }) {
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MenuButton />
        <span className="font-display" style={{ fontWeight: 700, letterSpacing: "0.18em", fontSize: 15 }}>
          LIFEOS
        </span>
        <span className="label" style={{ fontSize: 8.5 }}>
          {sub}
        </span>
      </div>
      <div
        className="font-data"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 9,
          letterSpacing: "0.14em",
          color: "var(--acc)",
          border: "1px solid var(--acc-line)",
          padding: "3px 8px",
        }}
      >
        <span className="blink" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--acc)" }} aria-hidden />
        SYS.OK
      </div>
    </header>
  );
}
