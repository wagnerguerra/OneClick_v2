import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[2px] text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]',
  {
    variants: {
      variant: {
        // Filled
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary/85 hover:shadow',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/85 hover:shadow',
        success:
          'bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 hover:shadow',
        warning:
          'bg-amber-500 text-white shadow-sm hover:bg-amber-600 hover:shadow',
        info:
          'bg-sky-500 text-white shadow-sm hover:bg-sky-600 hover:shadow',
        dark:
          'bg-foreground text-background shadow-sm hover:bg-foreground/85',

        // Outline
        outline:
          'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
        'outline-primary':
          'border border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground',
        'outline-destructive':
          'border border-destructive text-destructive bg-transparent hover:bg-destructive hover:text-destructive-foreground',
        'outline-success':
          'border border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-transparent hover:bg-emerald-500 hover:text-white',

        // Soft (light background)
        soft:
          'bg-primary/10 text-primary hover:bg-primary/20',
        'soft-destructive':
          'bg-destructive/10 text-destructive hover:bg-destructive/20',
        'soft-success':
          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20',
        'soft-warning':
          'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20',
        'soft-info':
          'bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20',

        // Ghost
        ghost:
          'hover:bg-accent hover:text-accent-foreground',
        'ghost-destructive':
          'text-destructive hover:bg-destructive/10',

        // Link
        link:
          'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-[38px] px-4 py-2',
        sm: 'h-[32px] px-3 text-xs',
        lg: 'h-[42px] px-6 text-sm',
        xs: 'h-[26px] px-2 text-xs',
        icon: 'h-[38px] w-[38px]',
        'icon-sm': 'h-[32px] w-[32px]',
        'icon-xs': 'h-[26px] w-[26px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
