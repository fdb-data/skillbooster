import React from 'react'

type IconProps = {
  size?: number
  color?: string
  style?: React.CSSProperties
  className?: string
}

const defaults = { size: 16, color: 'currentColor' }

// ── Navigation ──

export const ArrowLeft: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
)

export const ArrowRight: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

// ── Actions ──

export const Send: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
  </svg>
)

export const Play: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M5 3l14 9-14 9V3z" fill={color} stroke="none" />
  </svg>
)

export const Check: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

export const Close: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)

export const Edit: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

export const Trash: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
)

export const Plus: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

// ── Objects ──

export const Paperclip: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
  </svg>
)

export const Settings: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
)

export const FileText: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
  </svg>
)

// ── Tree / Disclosure ──

export const ChevronRight: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M9 18l6-6-6-6" />
  </svg>
)

export const ChevronDown: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

export const Dot: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style} className={className}>
    <circle cx="12" cy="12" r="4" />
  </svg>
)

// ── Brand ──

export const MindLogo: React.FC<IconProps> = ({ size = 20, color = '#4F46E5', style, className }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={style} className={className}>
    <circle cx="16" cy="16" r="14" stroke={color} strokeWidth="2.5" />
    <path d="M10 16c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
    <path d="M13 16c0-1.7 1.3-3 3-3s3 1.3 3 3" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
    <circle cx="16" cy="16" r="1.5" fill={color} />
    <path d="M8 12c1-2 3-3 5-3M24 12c-1-2-3-3-5-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
  </svg>
)

// ── Status ──

export const CircleDot: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="4" fill={color} />
  </svg>
)

export const Eye: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const Upload: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
)

export const Download: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
)

export const Refresh: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M23 4v6h-6M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
)

export const Eraser: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M20 20H7L3 16a2 2 0 010-2.83l9.17-9.17a2 2 0 012.83 0l5 5a2 2 0 010 2.83L13 20" />
    <path d="M18 13L9 4" />
  </svg>
)

export const Copy: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
)

export const Sun: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
)

export const Moon: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
)

export const Monitor: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
)

export const Shield: React.FC<IconProps> = ({ size = defaults.size, color = defaults.color, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)
