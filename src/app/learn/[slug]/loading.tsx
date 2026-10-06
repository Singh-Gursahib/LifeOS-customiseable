import { ScreenSkeleton, Bar } from "@/components/Skeleton";

export default function Loading() {
  return (
    <ScreenSkeleton sub="LEARNING SPACE">
      <Bar w={120} h={26} />
      <Bar w="85%" h={30} mt={6} />
      <div className="sk" style={{ height: 76 }} aria-hidden /> {/* why-now callout */}
      <Bar h={13} />
      <Bar w="96%" h={13} />
      <Bar w="90%" h={13} />
      <Bar w="93%" h={13} />
    </ScreenSkeleton>
  );
}
