import React from 'react'

type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'accent'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-canvas text-sub',
  success: 'bg-[#DCFCE7] text-[#166534]',
  warn: 'bg-[#FEF3C7] text-[#92400E]',
  danger: 'bg-[#FEE2E2] text-[#991B1B]',
  accent: 'bg-accent-soft text-accent'
}

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', className = '', children, ...rest }) => (
  <span
    {...rest}
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${TONE_CLASS[tone]} ${className}`}>
    {children}
  </span>
)

export default Badge
