import type { BiasResult } from '@/api/bias'
import type { Persona } from '@/api/personas'
import { BiasNarrative } from './BiasNarrative'
import { BiasFeedback } from './BiasFeedback'
import { BiasSimulation } from './BiasSimulation'

const LABELS: Record<string, string> = {
  fomo: 'Peur de manquer',
  panique: 'Panique',
  autorite_sociale: 'Influence sociale',
  surconfiance: 'Surconfiance',
  ancrage: 'Ancrage',
  concentration: 'Concentration',
  urgence: 'Urgence',
  euphorie: 'Euphorie',
}

const percent = (value: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'percent', maximumFractionDigits: 1 }).format(value)

const LIST = 'list-disc space-y-1 pl-5'

interface BiasDetailsProps {
  result: BiasResult
  persona: Persona
  ticker: string
}

/**
 * The result of a « Prendre du recul » analysis: the signals found in the
 * message, the title's recent context, the link with the profile, the
 * narrator's reading, the 2022 simulation, then sources and limits.
 */
export function BiasDetails({ result, persona, ticker }: BiasDetailsProps) {
  const { history } = result
  return (
    <div className="space-y-6 border-t border-border pt-6" aria-live="polite">
      {result.warnings.length > 0 && (
        <div role="status" className="rounded-2xl border border-border p-5 text-sm">
          <p className="font-medium">Certaines données ou fonctions sont indisponibles</p>
          <ul className={`mt-1 text-muted-foreground ${LIST}`}>
            {Array.from(new Set(result.warnings)).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="space-y-2">
        <h4 className="font-display text-lg font-medium">Indices possibles dans votre message</h4>
        {result.signals.length ? (
          <ul className="space-y-1 text-sm">
            {result.signals.map((signal) => (
              <li key={signal.category}>
                <strong>{LABELS[signal.category] ?? signal.category}</strong> : « {signal.excerpt} »
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">
            Aucun signal détecté dans le message. Cela ne permet pas de conclure à l’absence de biais.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Ces indices ne prouvent pas qu’une décision est impulsive. Aucun historique de décisions ou
          transactions personnelles n’est disponible.
        </p>
      </section>

      <section className="space-y-2">
        <h4 className="font-display text-lg font-medium">Contexte du titre</h4>
        {history ? (
          <div className="space-y-1 text-sm">
            <p>
              Variation sur 20 séances ({history.start} au {history.end}) :{' '}
              <strong className="tabular-nums">{percent(history.return_20d)}</strong>.
            </p>
            {history.from_year_high !== null && (
              <p>
                Écart au plus haut sur la période disponible (maximum 252 séances, du {history.year_start} au{' '}
                {history.year_end}) : {percent(history.from_year_high)}.
              </p>
            )}
            {history.volume_ratio !== null && (
              <p>Volume récent / volume habituel : {history.volume_ratio.toFixed(2)}×.</p>
            )}
            <p>
              Signal de battage : {result.hype === null ? 'indisponible' : result.hype ? 'détecté' : 'non détecté'}{' '}
              selon les seuils de prix, de volume et, si disponible, de couverture médiatique.
            </p>
            <p className="text-xs text-muted-foreground">
              {history.source === 'yfinance'
                ? 'Données historiques Yahoo Finance, susceptibles d’être différées ou révisées.'
                : 'Données historiques du datathon, pas des cours en direct.'}{' '}
              Une variation passée ne prouve pas la motivation de la décision.
            </p>
          </div>
        ) : (
          <p className="text-sm">Historique insuffisant ou indisponible pour contextualiser cette décision.</p>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="font-display text-lg font-medium">Lien avec le profil de {persona.name}</h4>
        <p className="text-sm">
          Horizon : <strong>{persona.horizon}</strong> · Tolérance au risque :{' '}
          <strong>{persona.risk_tolerance}</strong>.
        </p>
        {persona.preferences.length > 0 && (
          <p className="text-sm text-muted-foreground">Préférences : {persona.preferences.join(', ')}.</p>
        )}
        {result.profile_flags.length ? (
          <ul className={`text-sm ${LIST}`}>
            {result.profile_flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">
            Aucun écart détecté par les règles disponibles ; cela ne garantit pas que la décision convient au profil.
          </p>
        )}
        {persona.preferences.includes('ESG') && (
          <p className="text-xs text-muted-foreground">
            Cette analyse ne vérifie pas les controverses ESG : l’absence d’alerte ici ne signifie pas que le titre
            respecte ces critères. Voyez le bloc « ESG et controverses » de la fiche.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="font-display text-lg font-medium">Selon ton profil</h4>
        <BiasNarrative answer={result.analysis.answer} />
        {!result.analysis.governance.passed && (
          <p role="alert" className="text-sm text-destructive">
            Certains contrôles de l’analyse ont échoué. Consultez les limites avant de l’interpréter.
          </p>
        )}
      </section>

      <BiasSimulation simulation={result.simulation} />

      <BiasFeedback personaId={persona.id} ticker={ticker} />

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Sources, hypothèses et limites</summary>
        <div className="mt-3 space-y-3">
          <div>
            <strong>Sources</strong>
            <ul className={LIST}>
              {result.analysis.sources.map((source) => (
                <li key={source.id}>
                  {source.url ? (
                    <a className="link" href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                  ) : (
                    source.title
                  )}
                  {source.as_of ? ` (${source.as_of})` : ''}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <strong>Hypothèses</strong>
            <ul className={LIST}>
              {result.analysis.assumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <strong>Limites et indisponibilités</strong>
            <ul className={LIST}>
              {Array.from(new Set([...result.analysis.limits, ...result.warnings])).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </div>
  )
}
