import { ScreenSkeleton, Bar, RowsSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton sub="PERSONAL TELEMETRY">
      <div className="sk" style={{ height: 150 }} aria-hidden /> {/* masthead + gauges */}
      <div className="sk" style={{ height: 72 }} aria-hidden /> {/* REC module */}
      <Bar w={170} h={9} mt={4} />
      <RowsSkeleton n={4} />
      <Bar w={130} h={9} mt={4} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <div className="sk" style={{ height: 30, width: 150 }} aria-hidden />
        <div className="sk" style={{ height: 30, width: 130 }} aria-hidden />
      </div>
    </ScreenSkeleton>
  );
}
