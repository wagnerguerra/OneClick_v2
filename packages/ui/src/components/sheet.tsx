'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('sheet-overlay fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px]', className)}
    {...props}
  />
))
SheetOverlay.displayName = 'SheetOverlay'

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: 'left' | 'right'
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, children, side = 'right', size = 'lg', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'sheet-content fixed z-50 flex flex-col bg-card shadow-2xl border-l border-border/60 overflow-hidden inset-y-0 w-[70vw]',
        side === 'right' && 'right-0 sheet-slide-right',
        side === 'left' && 'left-0 sheet-slide-left',
        SIZES[size],
        className,
      )}
      onPointerDownOutside={e => {
        const target = e.target as HTMLElement
        if (target?.closest?.('.swal2-container, .swal2-popup')) e.preventDefault()
      }}
      onInteractOutside={e => {
        const target = e.target as HTMLElement
        if (target?.closest?.('.swal2-container, .swal2-popup')) e.preventDefault()
      }}
      onFocusOutside={e => {
        const target = e.target as HTMLElement
        if (target?.closest?.('.swal2-container, .swal2-popup')) e.preventDefault()
      }}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-md opacity-60 ring-offset-background transition-all hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
        <X className="h-4 w-4" />
        <span className="sr-only">Fechar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
SheetContent.displayName = 'SheetContent'

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('shrink-0 border-b border-border/60 bg-muted/30 px-6 py-4 text-left', className)} {...props} />
)

const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 overflow-y-auto px-6 py-4', className)} {...props} />
)

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-border/60 bg-muted/30 px-6 py-3', className)} {...props} />
)

const SheetTitle = DialogPrimitive.Title
const SheetDescription = DialogPrimitive.Description

export {
  Sheet, SheetTrigger, SheetClose, SheetContent,
  SheetHeader, SheetBody, SheetFooter, SheetTitle, SheetDescription,
}
