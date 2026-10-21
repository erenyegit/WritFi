export function MailIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7.5 8 5.5 8-5.5" />
    </svg>
  );
}

export function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

const line = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function WalletIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...line} className={className}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17a1 1 0 0 1 1 1v2" />
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M15.5 13.5h1.5" />
    </svg>
  );
}

export function UserPlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...line} className={className}>
      <circle cx="10" cy="8.5" r="3.5" />
      <path d="M3.5 19a6.5 6.5 0 0 1 13 0" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  );
}

export function ChartIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...line} className={className}>
      <path d="M4 19h16" />
      <path d="m5 15 4.5-4.5 3.5 3 6-6.5" />
      <path d="M15 7h4v4" />
    </svg>
  );
}

export function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...line} className={className}>
      <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

export function SealIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...line} className={className}>
      <circle cx="12" cy="10" r="5.5" />
      <path d="m9.5 15 -1.5 5.5 4-2 4 2-1.5-5.5" />
    </svg>
  );
}

export function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...line} className={className}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

export function BoltIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...line} className={className}>
      <path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z" />
    </svg>
  );
}
