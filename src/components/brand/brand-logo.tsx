import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_SHORT_NAME, APP_TAGLINE } from "@/constants";

type BrandLogoProps = {
  variant?: "icon" | "full" | "sidebar" | "stacked";
  href?: string;
  showText?: boolean;
  className?: string;
};

function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#0e1a26]"
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.jpg"
        alt={APP_SHORT_NAME}
        width={size}
        height={size}
        className="object-cover object-center"
        priority
      />
    </div>
  );
}

export function BrandLogo({
  variant = "icon",
  href,
  showText = true,
  className,
}: BrandLogoProps) {
  const content =
    variant === "full" ? (
      <div className={cn("flex flex-col items-center", className)}>
        <div className="overflow-hidden rounded-2xl bg-[#0e1a26] px-4 py-3">
          <Image
            src="/logo-full.jpg"
            alt={APP_NAME}
            width={420}
            height={160}
            className="h-auto w-full max-w-[min(100%,420px)] object-contain"
            priority
          />
        </div>
      </div>
    ) : variant === "stacked" ? (
      <div className={cn("flex flex-col items-center gap-4 text-center", className)}>
        <LogoMark size={56} />
        {showText && (
          <div>
            <p className="text-2xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-[#80C342] to-[#00AEEF] bg-clip-text text-transparent">
                {APP_SHORT_NAME}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{APP_TAGLINE}</p>
          </div>
        )}
      </div>
    ) : variant === "sidebar" ? (
      <div className={cn("flex min-w-0 items-center gap-3", className)}>
        <LogoMark size={36} />
        {showText && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">
              <span className="text-[#80C342]">{APP_SHORT_NAME}</span>
            </p>
            <p className="truncate text-[10px] text-muted-foreground">{APP_TAGLINE}</p>
          </div>
        )}
      </div>
    ) : (
      <div className={cn("inline-flex items-center gap-3", className)}>
        <LogoMark size={40} />
        {showText && (
          <div>
            <p className="font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-[#80C342] to-[#1A202C] bg-clip-text text-transparent dark:to-[#00AEEF]">
                {APP_SHORT_NAME}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
          </div>
        )}
      </div>
    );

  if (href) {
    return (
      <Link href={href} className="inline-flex">
        {content}
      </Link>
    );
  }

  return content;
}
