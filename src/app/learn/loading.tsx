import { ScreenSkeleton, Bar, RowsSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton sub="LEARNING SPACE">
      <div className="sk" style={{ height: 168 }} aria-hidden /> {/* masthead + stats */}
      <Bar w={150} h={9} mt={4} />
      <RowsSkeleton n={3} h={112} />
    </ScreenSkeleton>
  );
}
