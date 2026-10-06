interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
});

export const HomeIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 11l8-7 8 7v9h-6v-6h-4v6H4z" />
  </svg>
);

export const VaultIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M3 7h6l2 2h10v10H3z" />
  </svg>
);

export const GraphIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="12" cy="6" r="2.5" />
    <circle cx="19" cy="14" r="2.5" />
    <path d="M8 16.5L10.5 8M14 7.5l3.5 4.5" />
  </svg>
);

export const AskIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 5h16v11H9l-5 4z" />
  </svg>
);

export const RecIcon = ({ size = 22, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
    <circle cx="12" cy="12" r="5" fill="currentColor" />
  </svg>
);

export const MicIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

export const ChevronIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const StarIcon = ({ size = 16, className, filled }: IconProps & { filled?: boolean }) => (
  <svg {...base(size, className)} fill={filled ? "currentColor" : "none"}>
    <path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.9 6.7 19.5l1.1-6L3.4 9.3l6-.8z" />
  </svg>
);

export const SearchIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

export const FolderIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M3 6h6l2 2h10v11H3z" />
  </svg>
);

export const FileIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
  </svg>
);

export const UploadIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 15V4M8 8l4-4 4 4M5 15v4h14v-4" />
  </svg>
);

export const TextIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M5 5h14M5 10h14M5 15h9" />
  </svg>
);

export const BackIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

export const CloseIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const SendIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 12l16-8-6 16-3-6-7-2z" />
  </svg>
);

export const CheckIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 12l5 5 11-11" />
  </svg>
);

export const HeartIcon = ({ size = 16, className, filled }: IconProps & { filled?: boolean }) => (
  <svg {...base(size, className)} fill={filled ? "currentColor" : "none"}>
    <path d="M12 20s-7-4.6-7-9.3A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 2.7C19 15.4 12 20 12 20z" />
  </svg>
);

export const LockIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="4.5" y="10.5" width="15" height="9.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);
