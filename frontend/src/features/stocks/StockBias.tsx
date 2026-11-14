import { useState, type FormEvent } from 'react'
import { useStockBias, type BiasIntent } from '@/api/bias'
import type { HypeComponentId, HypeSignal } from '@/api/persona'
import type { Persona } from '@/api/personas'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useActivePersona } from '@/features/personas/activePersona'
import { BiasDetails } from './BiasDetails'
import { biasPrefill, type BiasPrefill } from './biasPrefill'

const INTENTS: Array<{ value: BiasIntent; label: string }> = [
  { value: 'buy', label: 'Acheter' },
  { value: 'sell', label: 'Vendre' },
  { value: 'undecided', label: 'Je ne sais pas encore' },
]

interface BiasFormProps {
  ticker: string
  persona: Persona
  /** The situation proposed from the hype signal; `null` when there is none. */
  prefill: BiasPrefill | null
  /** Name of the component the investor pointed at in the hype field, when they did. */
  pickedLabel: string | null
}

function BiasForm({ ticker, persona, prefill, pickedLabel }: BiasFormProps) {
  // `null` until the user touches a field: the proposal shows meanwhile, whenever the signal arrives.
  const [typed, setTyped] = useState<string | null>(null)
  const [chosen, setChosen] = useState<BiasIntent | null>(null)
  const mutation = useStockBias()
  const message = typed ?? prefill?.message ?? ''
  const intent = chosen ?? prefill?.intent ?? null

  const resetResult = () => {
    if (mutation.isSuccess || mutation.isError) mutation.reset()
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (message.trim() && intent) {
      mutation.mutate({ ticker, persona_id: persona.id, message: message.trim(), intent })
    }
  }

  return (
    <section aria-labelledby="bias-heading" className="space-y-5">
      <div className="space-y-1">
        <h3 id="bias-heading" className="text-xl">
          Examiner ma décision
        </h3>
        <p className="text-sm text-muted-foreground">
          Examinez votre intention pour {ticker} à la lumière de l’historique du titre et du profil de {persona.name}.
        </p>
      </div>

      {prefill && (
        <p role="note" className="rounded-2xl border border-warning/40 bg-warning/5 p-5 text-sm">
          {pickedLabel ? (
            <>
              <strong className="font-medium">Vous avez désigné « {pickedLabel} ».</strong> Le formulaire part de
              cette envie, avec les chiffres du signal.
            </>
          ) : (
            <>
              <strong className="font-medium">Battage élevé sur {ticker}.</strong> C’est le moment où l’envie
              d’acheter est la plus forte : le formulaire propose cette situation, à partir des chiffres du signal.
            </>
          )}{' '}
          Modifiez-la pour décrire la vôtre, puis lancez l’analyse.
        </p>
      )}

      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={mutation.isPending} className="space-y-2">
          <legend className="text-sm font-medium">Que souhaitez-vous examiner ?</legend>
          <div className="flex flex-wrap gap-2">
            {INTENTS.map((choice) => (
              <label key={choice.value} className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="bias-intent"
                  value={choice.value}
                  checked={intent === choice.value}
                  onChange={() => {
                    setChosen(choice.value)
                    resetResult()
                  }}
                />
                <span className="inline-flex min-h-11 items-center rounded-full border border-border px-5 font-display text-xs font-medium tracking-[0.16em] uppercase transition-colors hover:border-foreground peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                  {choice.label}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Choix pour l’analyse uniquement : aucun ordre réel ne sera passé.
          </p>
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="bias-message" className="block text-sm font-medium">
            Pourquoi envisagez-vous cette décision ?
          </label>
          <Textarea
            id="bias-message"
            value={message}
            disabled={mutation.isPending}
            maxLength={4000}
            rows={3}
            placeholder="Par exemple : le cours a baissé et je m’interroge sur la suite…"
            onChange={(event) => {
              setTyped(event.target.value)
              resetResult()
            }}
          />
        </div>

        <Button
          type="submit"
          disabled={!intent || !message.trim() || mutation.isPending}
          loading={mutation.isPending}
          loadingText="Analyse en cours…"
        >
          Analyser ma décision
        </Button>
      </form>

      {mutation.isPending && (
        <div role="status" className="rounded-2xl border border-border p-5 text-sm">
          <p className="font-medium">Analyse en cours…</p>
          <p className="mt-1 text-muted-foreground">L’analyse comprend les étapes suivantes :</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Analyse de votre message et de votre profil</li>
            <li>Examen des données historiques et recherche de contexte médiatique sur le web, si disponible</li>
            <li>Simulation historique et préparation de la réponse</li>
          </ul>
        </div>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          Impossible de terminer l’analyse.{' '}
          {mutation.error.status === 0 ? 'Vérifiez la connexion au serveur.' : mutation.error.message}
        </p>
      )}
      {mutation.data && <BiasDetails result={mutation.data} persona={persona} />}
    </section>
  )
}

interface StockBiasProps {
  ticker: string
  /** The title's hype signal, once known: a high one pre-fills the form (the tempted investor's case). */
  hype?: HypeSignal
  /** The component of the signal the investor pointed at: the form starts again from it. */
  picked?: HypeComponentId | null
}

/**
 * Step 4 on a stock page: examine an intention to buy or sell against the
 * title's history and the active profile. The hype signal comes first: what
 * the investor points at there (or a high signal) words the intention, which
 * stays free text to rewrite.
 */
export function StockBias({ ticker, hype, picked = null }: StockBiasProps) {
  const { personaId, persona } = useActivePersona()
  if (!personaId || !persona) return null
  const pickedLabel = hype?.components.find((component) => component.id === picked)?.label ?? null
  return (
    <BiasForm
      key={`${ticker}:${personaId}:${picked ?? ''}`}
      ticker={ticker}
      persona={persona}
      prefill={biasPrefill(hype, picked)}
      pickedLabel={pickedLabel}
    />
  )
}
