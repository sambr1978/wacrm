"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoVariant = "logo" | "symbol" | "wordmark";

const SOURCES: Record<
  BrandLogoVariant,
  {
    light: string;
    dark: string;
    width: number;
    height: number;
  }
> = {
  logo: {
    light: "/brand/conversa-logo-light.png",
    dark: "/brand/conversa-logo-dark.png",
    width: 1225,
    height: 359,
  },
  symbol: {
    light: "/brand/conversa-symbol-light.png",
    dark: "/brand/conversa-symbol-dark.png",
    width: 917,
    height: 921,
  },
  wordmark: {
    light: "/brand/conversa-wordmark-light.png",
    dark: "/brand/conversa-wordmark-dark.png",
    width: 836,
    height: 300,
  },
};

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  className?: string;
  priority?: boolean;
}

export function BrandLogo({
  variant = "logo",
  className,
  priority = false,
}: BrandLogoProps) {
  const source = SOURCES[variant];

  return (
    <span className={cn("relative block overflow-hidden", className)}>
      <Image
        src={source.light}
        alt="Conversa CRM"
        width={source.width}
        height={source.height}
        priority={priority}
        className="brand-asset-light h-full w-full object-contain"
      />
      <Image
        src={source.dark}
        alt=""
        aria-hidden="true"
        width={source.width}
        height={source.height}
        priority={priority}
        className="brand-asset-dark h-full w-full object-contain"
      />
    </span>
  );
}
