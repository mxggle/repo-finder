import type { SVGProps } from 'react'

// 16px outline icons drawn on a 16×16 grid; they inherit the text colour.
function Icon({ children, size = 16, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}

export const StarIcon = () => (
  <Icon>
    <path d="m8 1.75 1.93 3.9 4.3.63-3.11 3.03.73 4.29L8 11.57 4.15 13.6l.73-4.29-3.11-3.03 4.3-.63z" />
  </Icon>
)

export const ForkIcon = () => (
  <Icon>
    <circle cx="4" cy="3.25" r="1.5" />
    <circle cx="12" cy="3.25" r="1.5" />
    <circle cx="8" cy="12.75" r="1.5" />
    <path d="M4 4.75v1.5A1.75 1.75 0 0 0 5.75 8h4.5A1.75 1.75 0 0 0 12 6.25v-1.5M8 8v3.25" />
  </Icon>
)

export const ClockIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 4.75V8l2.25 1.5" />
  </Icon>
)

export const LicenseIcon = () => (
  <Icon>
    <path d="M8 2v12M4.5 14h7M2.5 4.5h11M4.5 4.5 2.25 9.5a2.25 2.25 0 0 0 4.5 0zM11.5 4.5l-2.25 5a2.25 2.25 0 0 0 4.5 0z" />
  </Icon>
)

export const SearchIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="7" cy="7" r="4.75" />
    <path d="m13.5 13.5-3.1-3.1" />
  </Icon>
)

export const AlertIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M7.13 2.5a1 1 0 0 1 1.74 0l5.5 9.75a1 1 0 0 1-.87 1.5H2.5a1 1 0 0 1-.87-1.5z" />
    <path d="M8 6.25v2.5M8 11.1v.02" />
  </Icon>
)

export const ChevronLeftIcon = () => (
  <Icon>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </Icon>
)

export const ChevronRightIcon = () => (
  <Icon>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Icon>
)
