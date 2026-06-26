import React from 'react'

interface PageHeaderProps {
  left?: React.ReactNode
  center?: React.ReactNode
  right?: React.ReactNode
}

const PageHeader: React.FC<PageHeaderProps> = ({ left, center, right }) => (
  <div className="grid h-11 shrink-0 grid-cols-3 items-center border-b border-line bg-surface px-4">
    <div className="flex min-w-0 items-center gap-2 justify-self-start">{left}</div>
    <div className="justify-self-center">{center}</div>
    <div className="flex items-center gap-2 justify-self-end">{right}</div>
  </div>
)

export default PageHeader
