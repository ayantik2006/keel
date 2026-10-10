type IconProps = { className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
};

export function EncryptionIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="6" y="11" width="12" height="8" />
      <path d="M9 11V7a3 3 0 0 1 6 0v4" />
      <path d="M12 14.5v2" />
    </svg>
  );
}

export function RbacIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 3 19 5.5V11c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V5.5Z" />
      <path d="M9 12.2 11 14.2 15.2 10" />
    </svg>
  );
}

export function AuditLogIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="5" y="3" width="14" height="18" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </svg>
  );
}

export function MachineIdentityIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="7" y="7" width="10" height="10" />
      <path d="M9 7V4M15 7V4M9 20v-3M15 20v-3M7 9H4M7 15H4M20 9h-3M20 15h-3" />
    </svg>
  );
}

export function EnvironmentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="4" y="4" width="16" height="4" />
      <rect x="4" y="10" width="16" height="4" />
      <rect x="4" y="16" width="16" height="4" />
    </svg>
  );
}

export function RotationIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 12a8 8 0 0 1 13.5-5.8" />
      <path d="M17.5 3v3.5H14" />
      <path d="M20 12a8 8 0 0 1-13.5 5.8" />
      <path d="M6.5 21v-3.5H10" />
    </svg>
  );
}
