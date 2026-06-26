import React from 'react'

type Variant = 'primary' | 'soft' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  soft: 'btn-soft',
  ghost: 'btn-ghost',
  danger: 'btn-primary bg-[#E05D5D] hover:opacity-90'
}

const SIZE_CLASS: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-[11px]',
  md: 'px-3.5 py-1.5 text-[11px]',
  lg: 'px-5 py-2.5 text-[12px]'
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', className = '', children, ...rest }) => (
  <button
    {...rest}
    className={`cursor-pointer select-none rounded-md transition-colors duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}>
    {children}
  </button>
)

export default Button
