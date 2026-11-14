import { Toaster as Sonner, type ToasterProps } from 'sonner'
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react'

// No next-themes here — this template has no theme-switching provider yet.
// "system" lets Sonner read prefers-color-scheme on its own.
//
// unstyled + classNames (rather than Sonner's default CSS-variable/style
// approach) keeps every color on a semantic Tailwind token, consistent
// with the rest of src/components/ui.
// Hoisted rather than inline: a literal object written straight into a JSX
// attribute opens with two braces, and setup-project.py renders any template
// file containing that sequence through Jinja.
const icons: ToasterProps['icons'] = {
  success: <CircleCheckIcon className="size-4" />,
  info: <InfoIcon className="size-4" />,
  warning: <TriangleAlertIcon className="size-4" />,
  error: <OctagonXIcon className="size-4" />,
  loading: <Loader2Icon className="size-4 animate-spin" />,
}

const toastOptions: ToasterProps['toastOptions'] = {
  unstyled: true,
  classNames: {
    toast:
      'group flex w-full items-center gap-3 rounded-2xl border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg',
    title: 'font-medium',
    description: 'text-muted-foreground',
    actionButton: 'rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground',
    cancelButton: 'rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground',
  },
}

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      icons={icons}
      toastOptions={toastOptions}
      {...props}
    />
  )
}

export { Toaster }
