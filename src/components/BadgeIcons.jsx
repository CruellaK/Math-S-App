import React from 'react';

function SvgWrap({ children, className = '' }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

export function SpeedBadgeIcon({ className = 'w-6 h-6' }) {
  return (
    <SvgWrap className={className}>
      <path d="M12 40c0-11 9-20 20-20 7 0 13 3 17 9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M31 32l11-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M43 22l9 1-2 8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 48h32" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </SvgWrap>
  );
}

export function ZeroFaultBadgeIcon({ className = 'w-6 h-6' }) {
  return (
    <SvgWrap className={className}>
      <circle cx="32" cy="32" r="18" stroke="currentColor" strokeWidth="4" />
      <path d="M24 33l6 6 12-14" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 17l6 3M47 17l-6 3" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </SvgWrap>
  );
}

export function MethodBadgeIcon({ className = 'w-6 h-6' }) {
  return (
    <SvgWrap className={className}>
      <rect x="15" y="14" width="34" height="36" rx="6" stroke="currentColor" strokeWidth="4" />
      <path d="M23 24h18M23 32h18M23 40h10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M38 43l4 4 8-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </SvgWrap>
  );
}

export function CreditBadgeIcon({ className = 'w-6 h-6' }) {
  return (
    <SvgWrap className={className}>
      <ellipse cx="32" cy="22" rx="14" ry="8" stroke="currentColor" strokeWidth="4" />
      <path d="M18 22v16c0 4 6 8 14 8s14-4 14-8V22" stroke="currentColor" strokeWidth="4" />
      <path d="M26 30h12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </SvgWrap>
  );
}

export function XpBadgeIcon({ className = 'w-6 h-6' }) {
  return (
    <SvgWrap className={className}>
      <path d="M32 10l6 12 14 2-10 10 3 14-13-7-13 7 3-14-10-10 14-2 6-12z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
    </SvgWrap>
  );
}

export function MasterBadgeIcon({ className = 'w-6 h-6' }) {
  return (
    <SvgWrap className={className}>
      <path d="M18 16h28v10c0 9-6 17-14 20-8-3-14-11-14-20V16z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
      <path d="M32 24l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    </SvgWrap>
  );
}

export const BADGE_ICON_MAP = {
  speed_runner: SpeedBadgeIcon,
  zero_fault: ZeroFaultBadgeIcon,
  methodologist: MethodBadgeIcon,
  rich_mind: CreditBadgeIcon,
  xp_1000: XpBadgeIcon,
  session_master: MasterBadgeIcon,
};
