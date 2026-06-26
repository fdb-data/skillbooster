import React from 'react'

type Elevation = 'flat' | 'raised' | 'overlay'

const SHADOW_CLASS: Record<Elevation, string> = {
  flat: '',
  raised: 'shadow-[var(--shadow-sm)]',
  overlay: 'shadow-[var(--shadow-lg)]'
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation
}

const Card: React.FC<CardProps> = ({ elevation = 'flat', className = '', children, ...rest }) => (
  <div
    {...rest}
    className={`rounded-card border border-line bg-surface ${SHADOW_CLASS[elevation]} ${className}`}>
    {children}
  </div>
)

export default Card
