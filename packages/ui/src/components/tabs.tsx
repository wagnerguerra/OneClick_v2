'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: 'default' | 'pills' }
>(({ className, variant = 'default', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      variant === 'pills'
        ? 'flex flex-col gap-1.5 bg-transparent'
        : 'inline-flex items-center w-full bg-transparent border-b border-[#e9ebec]',
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

function PillArrow() {
  return (
    <svg
      className="absolute -right-[6px] top-1/2 -translate-y-1/2 text-primary opacity-0 transition-opacity group-data-[state=active]:opacity-100"
      width="6"
      height="12"
      viewBox="0 0 6 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M0 0L6 6L0 12V0Z" />
    </svg>
  )
}

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    icon?: React.ReactNode
    variant?: 'default' | 'pills'
  }
>(({ className, icon, children, variant = 'default', ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      variant === 'pills'
        ? [
            'group relative flex flex-col items-center justify-center',
            'w-[100px] h-[100px] rounded-md',
            'text-[11px] font-medium leading-tight text-center transition-all',
            'text-muted-foreground',
            'hover:bg-muted hover:text-foreground',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
            'focus-visible:outline-none',
          ]
        : [
            'inline-flex items-center gap-2 cursor-pointer',
            'focus-visible:outline-none',
          ],
      className,
    )}
    style={variant === 'default' ? undefined : undefined}
    data-tab-variant={variant}
    {...props}
  >
    {variant === 'pills' ? (
      <>
        {icon && <span className="shrink-0 mb-1.5 [&_svg]:h-7 [&_svg]:w-7">{icon}</span>}
        <span className="px-1">{children}</span>
        <PillArrow />
      </>
    ) : (
      <>
        {icon && <span className="shrink-0">{icon}</span>}
        {children}
      </>
    )}
  </TabsPrimitive.Trigger>
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'focus-visible:outline-none animate-in fade-in-0 duration-200',
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
