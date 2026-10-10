import Image from "next/image";

/** The full Keel lockup (monogram and wordmark) for light surfaces. */
export function Logo({ className = "h-8" }: { className?: string }) {
  return (
    <Image
      src="/keel-brand-assets/keel-logo.svg"
      alt="Keel"
      width={166}
      height={52}
      priority
      className={`w-auto ${className}`}
    />
  );
}

/** The K monogram alone. Takes its colour from the surrounding text colour. */
export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="1 2 60 60"
      role="img"
      aria-label="Keel"
      fill="currentColor"
      fillRule="evenodd"
      className={className}
    >
      <path d="M8 6 L20 6 L20 58 L8 58ZM42 6 L54 6 L38 29 L26 29ZM26 35 L38 35 L54 58 L42 58Z" />
    </svg>
  );
}
