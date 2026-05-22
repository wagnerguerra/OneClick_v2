'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('dialog-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]', className)}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'dialog-content relative my-auto w-full max-w-lg flex flex-col border bg-card shadow-2xl rounded-lg overflow-hidden max-h-[calc(100vh-3rem)]',
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
          // Permitir foco no SweetAlert2
          const target = e.target as HTMLElement
          if (target?.closest?.('.swal2-container, .swal2-popup')) e.preventDefault()
        }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md opacity-60 ring-offset-background transition-all duration-200 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          <X className="h-4 w-4" />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </div>
  </DialogPrimitive.Portal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('shrink-0 border-b border-border/60 bg-muted/30 px-5 py-4 text-left', className)} {...props} />
)

const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 overflow-y-auto px-5 py-4', className)} {...props} />
)

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-border/60 bg-muted/30 px-5 py-3', className)} {...props} />
)

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-base font-semibold leading-none tracking-tight', className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground mt-1', className)} {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
