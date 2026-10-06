import { ScreenSkeleton, Bar } from "@/components/Skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton sub="VAULT MAP">
      <Bar w={180} h={9} />
      <div className="sk" style={{ height: 420 }} aria-hidden /> {/* canvas */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[110, 96, 88, 104].map((w) => (
          <div key={w} className="sk" style={{ height: 26, width: w }} aria-hidden />
        ))}
      </div>
    </ScreenSkeleton>
  );
}
