import { useCallback, useState } from 'react'
import { useLabPipelines } from '@/api/lab'
import { AppLayout } from '@/components/layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { catalogErrorMessage, type LabRunRecord } from './labForm'
import { LabStepPanel } from './LabStepPanel'
import { RunsTable } from './RunsTable'

/**
 * The Labo: pick each pipeline stage's options, run a step, look at every
 * stage, and compare runs. The runs table lives in this page's state only,
 * so a reload clears it.
 */
export function LabPage() {
  const { data: catalog, error, isPending } = useLabPipelines()
  const [runs, setRuns] = useState<LabRunRecord[]>([])

  const addRun = useCallback((record: LabRunRecord) => {
    setRuns((current) => [record, ...current])
  }, [])

  const steps = catalog?.steps ?? []

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="sr-only">Labo</h1>

        {isPending && (
          <p role="status" className="text-muted-foreground">
            Chargement des pipelines…
          </p>
        )}

        {error && (
          <p role="alert" className="text-destructive">
            {catalogErrorMessage(error)}
          </p>
        )}

        {steps.length > 0 && (
          <>
            <Tabs defaultValue={steps[0].id}>
              <TabsList className="max-w-full justify-start overflow-x-auto">
                {steps.map((step) => (
                  <TabsTrigger key={step.id} value={step.id}>
                    {step.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {/* Every step stays mounted, so its fields and last results
                  survive a switch to another tab. */}
              {steps.map((step) => (
                <TabsContent
                  key={step.id}
                  value={step.id}
                  forceMount
                  className="data-[state=inactive]:hidden"
                >
                  <LabStepPanel step={step} onRun={addRun} />
                </TabsContent>
              ))}
            </Tabs>

            <RunsTable runs={runs} />
          </>
        )}
      </div>
    </AppLayout>
  )
}
