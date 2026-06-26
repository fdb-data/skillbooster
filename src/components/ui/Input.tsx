import React from 'react'

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...rest }) => (
  <input
    {...rest}
    className={`input-pill w-full px-2.5 py-1.5 text-[11px] text-ink outline-none focus:border-accent ${className}`} />
)

export default Input
