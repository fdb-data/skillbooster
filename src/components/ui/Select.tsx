import React from 'react'

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', children, ...rest }) => (
  <select
    {...rest}
    className={`input-pill w-full cursor-pointer px-2.5 py-1.5 text-[11px] text-ink outline-none focus:border-accent ${className}`}>
    {children}
  </select>
)

export default Select
