import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * Toggle group (Radix): `segmented` is a pill switch for one choice among a
 * few (single: items are radios); `chips` are separate outlined pills, for
 * filters that combine (multiple: items are pressed buttons).
 */
const groupVariants = cva('flex w-fit flex-wrap items-center', {
  variants: {
    variant: {
      segmented: 'gap-0.5 rounded-full bg-muted p-1',
      chips: 'gap-2',
    },
  },
  defaultVariants: { variant: 'segmented' },
})

const itemVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        segmented:
          'h-8 px-3 text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm',
        chips:
          'h-8 border border-border px-3 text-muted-foreground hover:bg-muted data-[state=on]:border-foreground/40 data-[state=on]:bg-secondary data-[state=on]:text-foreground',
      },
    },
    defaultVariants: { variant: 'segmented' },
  },
)

type GroupVariant = VariantProps<typeof groupVariants>['variant']

const ToggleGroupContext = React.createContext<GroupVariant>('segmented')

function ToggleGroup({
  className,
  variant = 'segmented',
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & VariantProps<typeof groupVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      className={cn(groupVariants({ variant }), className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={variant}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const variant = React.useContext(ToggleGroupContext)
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(itemVariants({ variant }), className)}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
