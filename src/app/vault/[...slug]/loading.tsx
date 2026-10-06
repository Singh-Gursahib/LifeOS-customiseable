import { ScreenSkeleton, Bar } from "@/components/Skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton sub="NOTE">
      <div className="sk" style={{ height: 34 }} aria-hidden /> {/* toolbar */}
      <Bar w="70%" h={26} mt={6} />
      <Bar h={13} />
      <Bar w="95%" h={13} />
      <Bar w="88%" h={13} />
      <Bar w="92%" h={13} />
      <Bar w="60%" h={13} />
    </ScreenSkeleton>
  );
}
