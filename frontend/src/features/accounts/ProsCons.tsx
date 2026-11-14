import { CircleCheck, CircleMinus } from 'lucide-react'

interface ProsConsProps {
  title: string
  items: string[]
  positive?: boolean
}

/** A titled list of advantages (check) or drawbacks (minus): icon and text, never color alone. */
export function ProsCons({ title, items, positive = false }: ProsConsProps) {
  const Icon = positive ? CircleCheck : CircleMinus
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <Icon
              aria-hidden="true"
              className={positive ? 'mt-0.5 size-4 shrink-0 text-success' : 'mt-0.5 size-4 shrink-0 text-warning'}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
