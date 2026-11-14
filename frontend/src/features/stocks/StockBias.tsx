import { useState, type FormEvent } from 'react'
import { useStockBias, type BiasResult } from '@/api/bias'
import { Button } from '@/components/ui/button'
import { useActivePersona } from '@/features/personas/activePersona'
import { BiasSimulation } from './BiasSimulation'

const labels: Record<string, string> = {
  fomo: 'Peur de manquer', panique: 'Panique', autorite_sociale: 'Influence sociale',
  surconfiance: 'Surconfiance', ancrage: 'Ancrage', concentration: 'Concentration',
  urgence: 'Urgence', euphorie: 'Euphorie',
}
const percent = (value: number) => new Intl.NumberFormat('fr-CA', { style: 'percent', maximumFractionDigits: 1 }).format(value)

function BiasDetails({ result }: { result: BiasResult }) {
  return <div className="space-y-6" aria-live="polite">
    {result.warnings.length > 0 && <div role="status" className="rounded-lg bg-muted p-3 text-sm">
      <p className="font-medium">Certaines données ou fonctions sont indisponibles</p>
      <ul className="mt-1 list-disc pl-5">{Array.from(new Set(result.warnings)).map((warning) => <li key={warning}>{warning}</li>)}</ul>
    </div>}
    <section className="space-y-2"><h3 className="font-semibold">Signaux dans votre message</h3>
      {result.signals.length ? <ul className="space-y-1 text-sm">{result.signals.map((signal) =>
        <li key={signal.category}><strong>{labels[signal.category] ?? signal.category}</strong> : « {signal.excerpt} »</li>)}</ul>
        : <p className="text-sm">Aucun signal détecté dans le message. Cela ne permet pas de conclure à l’absence de biais.</p>}
      <p className="text-xs text-muted-foreground">Ces indices ne prouvent pas qu’une décision est impulsive. Aucun historique de décisions ou transactions personnelles n’est disponible.</p>
    </section>
    <section className="space-y-2"><h3 className="font-semibold">Contexte du titre</h3>
      {result.history ? <div className="text-sm space-y-1">
        <p>Variation sur 20 séances ({result.history.start} au {result.history.end}) : <strong>{percent(result.history.return_20d)}</strong>.</p>
        {result.history.from_year_high !== null && <p>Écart au plus haut des 252 dernières séances ({result.history.year_start} au {result.history.year_end}) : {percent(result.history.from_year_high)}.</p>}
        {result.history.volume_ratio !== null && <p>Volume récent / volume habituel : {result.history.volume_ratio.toFixed(2)}×.</p>}
        <p>Signal de battage : {result.hype === null ? 'indisponible' : result.hype ? 'détecté' : 'non détecté'} selon les seuils de prix, de volume et, si disponible, de couverture médiatique.</p>
        <p className="text-xs text-muted-foreground">Données historiques du datathon, pas des cours en direct. Une variation passée ne prouve pas la motivation de la décision.</p>
      </div> : <p className="text-sm">Historique insuffisant ou indisponible pour contextualiser cette décision.</p>}
    </section>
    <section className="space-y-2"><h3 className="font-semibold">Lien avec le profil</h3>
      {result.profile_flags.length ? <ul className="list-disc pl-5 text-sm">{result.profile_flags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
        : <p className="text-sm">Aucun écart détecté par les règles disponibles ; cela ne garantit pas que la décision convient au profil.</p>}
    </section>
    <section className="space-y-2"><h3 className="font-semibold">Analyse</h3><p className="whitespace-pre-line text-sm">{result.analysis.answer}</p>
      {!result.analysis.governance.passed && <p role="alert" className="text-sm text-destructive">Certains contrôles de l’analyse ont échoué. Consultez les limites avant de l’interpréter.</p>}
    </section>
    <BiasSimulation simulation={result.simulation} />
    <details className="text-sm"><summary className="cursor-pointer font-medium">Sources, hypothèses et limites</summary>
      <div className="mt-3 space-y-3">
        <div><strong>Sources</strong><ul className="list-disc pl-5">{result.analysis.sources.map((source) => <li key={source.id}>{source.url ? <a className="underline" href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title}{source.as_of ? ` (${source.as_of})` : ''}</li>)}</ul></div>
        <div><strong>Hypothèses</strong><ul className="list-disc pl-5">{result.analysis.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><strong>Limites et indisponibilités</strong><ul className="list-disc pl-5">{Array.from(new Set([...result.analysis.limits, ...result.warnings])).map((item) => <li key={item}>{item}</li>)}</ul></div>
      </div>
    </details>
  </div>
}

function BiasForm({ ticker, personaId, personaName }: { ticker: string; personaId: string; personaName: string }) {
  const [message, setMessage] = useState('')
  const mutation = useStockBias()
  function submit(event: FormEvent) {
    event.preventDefault()
    if (message.trim()) mutation.mutate({ ticker, persona_id: personaId, message: message.trim() })
  }
  return <section id="prendre-du-recul" aria-labelledby="bias-heading" className="scroll-mt-6 space-y-5 border-t border-border pt-6">
    <div className="space-y-1"><h2 id="bias-heading" className="text-2xl font-semibold tracking-tight">Prendre du recul</h2>
      <p className="text-sm text-muted-foreground">Examinez votre intention pour {ticker} à la lumière de l’historique du titre et du profil de {personaName}.</p></div>
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="bias-message" className="block text-sm font-medium">Que souhaitez-vous faire, et pourquoi ?</label>
      <textarea id="bias-message" value={message} disabled={mutation.isPending} maxLength={4000} rows={3} placeholder="Par exemple : je souhaite vendre parce que le cours a baissé…"
        onChange={(event) => { setMessage(event.target.value); if (mutation.isSuccess || mutation.isError) mutation.reset() }}
        className="w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <Button type="submit" disabled={!message.trim() || mutation.isPending} loading={mutation.isPending} loadingText="Analyse en cours…">Analyser ma décision</Button>
    </form>
    {mutation.isError && <p role="alert" className="text-sm text-destructive">Impossible de terminer l’analyse. {mutation.error.status === 0 ? 'Vérifiez la connexion au serveur.' : mutation.error.message}</p>}
    {mutation.data && <BiasDetails result={mutation.data} />}
  </section>
}

export function StockBias({ ticker }: { ticker: string }) {
  const { personaId, persona } = useActivePersona()
  if (!personaId || !persona) return null
  return <BiasForm key={`${ticker}:${personaId}`} ticker={ticker} personaId={personaId} personaName={persona.name} />
}
