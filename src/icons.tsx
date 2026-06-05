// Minimal inline SVG icon set (replaces the mock's window.Icon.*). Stroke-based,
// inherits currentColor, sized via the `size` prop.
type IconProps = { size?: number }

function svg(size: number, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const Icon = {
  Shield: ({ size = 16 }: IconProps) => svg(size, <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />),
  Github: ({ size = 14 }: IconProps) =>
    svg(
      size,
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 00-.9-2.6c3-.3 6.2-1.5 6.2-6.8a5.3 5.3 0 00-1.5-3.7 4.9 4.9 0 00-.1-3.7s-1.2-.4-3.9 1.4a13.4 13.4 0 00-7 0C6.1 1.6 4.9 2 4.9 2a4.9 4.9 0 00-.1 3.7 5.3 5.3 0 00-1.5 3.7c0 5.3 3.2 6.5 6.2 6.8a3.4 3.4 0 00-.9 2.6V22" />,
    ),
  Branch: ({ size = 14 }: IconProps) =>
    svg(
      size,
      <>
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 01-9 9" />
      </>,
    ),
  HelpCircle: ({ size = 14 }: IconProps) =>
    svg(
      size,
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12" y2="17" />
      </>,
    ),
  CheckCircle: ({ size = 16 }: IconProps) =>
    svg(
      size,
      <>
        <path d="M22 11.1V12a10 10 0 11-5.9-9.1" />
        <path d="M22 4L12 14.01l-3-3" />
      </>,
    ),
  KeyRound: ({ size = 14 }: IconProps) =>
    svg(
      size,
      <>
        <circle cx="8" cy="15" r="4" />
        <path d="M10.8 12.2L19 4l2 2-1.5 1.5L21 9l-2 2-1.5-1.5L15 12" />
      </>,
    ),
  ArrowRight: ({ size = 14 }: IconProps) =>
    svg(
      size,
      <>
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </>,
    ),
  Wallet: ({ size = 16 }: IconProps) =>
    svg(
      size,
      <>
        <path d="M21 12V7H5a2 2 0 010-4h14v4" />
        <path d="M3 5v14a2 2 0 002 2h16v-5" />
        <path d="M18 12a2 2 0 000 4h3v-4z" />
      </>,
    ),
  ChevRight: ({ size = 16 }: IconProps) => svg(size, <polyline points="9 18 15 12 9 6" />),
  AlertTri: ({ size = 16 }: IconProps) =>
    svg(
      size,
      <>
        <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12" y2="17" />
      </>,
    ),
  LockOpen: ({ size = 14 }: IconProps) =>
    svg(
      size,
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 019.9-1" />
      </>,
    ),
  Terminal: ({ size = 16 }: IconProps) =>
    svg(
      size,
      <>
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </>,
    ),
  Eye: ({ size = 14 }: IconProps) =>
    svg(
      size,
      <>
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
        <circle cx="12" cy="12" r="3" />
      </>,
    ),
  EyeOff: ({ size = 14 }: IconProps) =>
    svg(
      size,
      <>
        <path d="M9.9 4.2A11 11 0 0112 4c7 0 11 7 11 7a18 18 0 01-2.2 3.2M6.6 6.6A18 18 0 001 11s4 7 11 7a11 11 0 005.4-1.4" />
        <path d="M1 1l22 22" />
      </>,
    ),
  Copy: ({ size = 14 }: IconProps) =>
    svg(
      size,
      <>
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </>,
    ),
  Download: ({ size = 14 }: IconProps) =>
    svg(
      size,
      <>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </>,
    ),
  Printer: ({ size = 14 }: IconProps) =>
    svg(
      size,
      <>
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </>,
    ),
  Trash: ({ size = 14 }: IconProps) =>
    svg(
      size,
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      </>,
    ),
}
