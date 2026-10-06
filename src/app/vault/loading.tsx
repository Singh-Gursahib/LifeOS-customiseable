import { ScreenSkeleton, Bar, RowsSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton sub="VAULT INDEX">
      <div className="sk" style={{ height: 38 }} aria-hidden /> {/* search */}
      <Bar w={150} h={9} mt={4} />
      <RowsSkeleton n={7} h={44} />
    </ScreenSkeleton>
  );
}
