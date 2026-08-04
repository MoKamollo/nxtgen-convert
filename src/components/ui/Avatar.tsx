"use client";
import Image from "next/image";
import { cn, getInitials } from "@/lib/utils";

const sizeClasses = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-12 w-12 text-base",
  "2xl": "h-16 w-16 text-xl",
};

const colorPalette = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-cyan-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-brand-600",
];

function getColorFromName(name: string): string {
  const idx = name.charCodeAt(0) % colorPalette.length;
  return colorPalette[idx];
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: keyof typeof sizeClasses;
  className?: string;
  status?: "online" | "away" | "busy" | "offline";
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
  status,
}: AvatarProps) {
  const statusColors = {
    online: "bg-emerald-400",
    away: "bg-amber-400",
    busy: "bg-red-400",
    offline: "bg-surface-500",
  };

  return (
    <div className="relative inline-flex shrink-0">
      {src ? (
        <Image
          src={src}
          alt={name}
          width={64}
          height={64}
          unoptimized
          className={cn(
            "rounded-full object-cover ring-1 ring-surface-700",
            sizeClasses[size],
            className,
          )}
        />
      ) : (
        <div
          className={cn(
            "rounded-full bg-gradient-to-br flex items-center justify-center font-semibold text-white ring-1 ring-surface-700/50 shrink-0",
            getColorFromName(name),
            sizeClasses[size],
            className
          )}
        >
          {getInitials(name)}
        </div>
      )}
      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 block rounded-full ring-2 ring-surface-900",
            statusColors[status],
            size === "xs" || size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"
          )}
        />
      )}
    </div>
  );
}

export function AvatarGroup({
  names,
  max = 3,
  size = "sm",
}: {
  names: string[];
  max?: number;
  size?: keyof typeof sizeClasses;
}) {
  const visible = names.slice(0, max);
  const remainder = names.length - max;

  return (
    <div className="flex -space-x-2">
      {visible.map((name, i) => (
        <Avatar key={i} name={name} size={size} />
      ))}
      {remainder > 0 && (
        <div
          className={cn(
            "rounded-full bg-surface-700 border-2 border-surface-900 flex items-center justify-center text-surface-300 font-medium",
            sizeClasses[size]
          )}
        >
          +{remainder}
        </div>
      )}
    </div>
  );
}
