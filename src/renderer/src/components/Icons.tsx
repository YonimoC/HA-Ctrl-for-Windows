import type { ReactNode } from 'react'

const PATHS = {
  home: <path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5v-6.5H9V21H4a1 1 0 0 1-1-1z" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  bulb: (
    <>
      <path d="M9.5 18h5M10.5 21h3" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2l.1.7h4.8l.1-.7c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" />
    </>
  ),
  plug: (
    <>
      <path d="M9 7V3M15 7V3" />
      <path d="M6 7h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 16v5" />
    </>
  ),
  thermometer: <path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z" />,
  fan: (
    <>
      <path d="M3 8h11a3 3 0 1 0-3-3" />
      <path d="M3 12h15a3 3 0 1 1-3 3" />
      <path d="M3 16h8a2.5 2.5 0 1 1-2.5 2.5" />
    </>
  ),
  blinds: (
    <>
      <path d="M4 4h16M6 4v16M18 4v16M6 9h12M6 14h12" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11 3l1.6 3.8L16.5 8.5 12.6 10 11 14l-1.6-4L5.5 8.5l3.9-1.7z" />
      <path d="M18 14l.9 2.1 2.1.9-2.1.9L18 20l-.9-2.1-2.1-.9 2.1-.9z" />
    </>
  ),
  script: (
    <>
      <path d="M8 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8" />
      <path d="M8 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2" />
      <path d="M10 9h6M10 13h6" />
    </>
  ),
  activity: <path d="M3 12h3.5l2.5-7 4 14 2.5-7H21" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  check: <path d="M4 12.5 9 18 20 6" />,
  drag: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  )
} as const

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 18,
  className,
  strokeWidth = 1.6
}: {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

export function iconFor(domain: string, deviceClass?: string | null): IconName {
  if (domain === 'light') return 'bulb'
  if (domain === 'climate') return 'thermometer'
  if (domain === 'fan') return 'fan'
  if (domain === 'cover') return 'blinds'
  if (domain === 'scene') return 'sparkles'
  if (domain === 'script' || domain === 'automation') return 'script'
  if (domain === 'sensor' || domain === 'binary_sensor') {
    if (deviceClass === 'temperature' || deviceClass === 'humidity') return 'thermometer'
    return 'activity'
  }
  return 'plug'
}
