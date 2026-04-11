import * as React from 'react'
import { cn } from '../lib/utils'

interface FormSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  description?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
}

const FormSection = React.forwardRef<HTMLDivElement, FormSectionProps>(
  ({ className, title, description, icon, actions, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-[2px] border bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]', className)}
      {...props}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between rounded-t-[2px] border-b border-border/60 bg-muted/30 px-5 py-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          {description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {/* Card Body */}
      <div className="p-5">{children}</div>
    </div>
  ),
)
FormSection.displayName = 'FormSection'

export { FormSection }
