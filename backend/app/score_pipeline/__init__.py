"""Score pipeline (step 1): builds the gold table `score_par_titre` from live public sources.

One activity, run on AWS by a Step Functions state machine that invokes the `score` collector Lambda
once per stage (see `infra/score_pipeline.tf`):

    bronze_titres -> silver_univers -> [bronze_releves | bronze_cours | bronze_articles]
                  -> [silver_releves | silver_cours | silver_evenements] -> gold

Every stage reads its inputs from and writes its outputs to the data bucket under `score/`
(`score/<layer>/<dataset>/<date>/<run_id>/...`), and records what it did (status, timings, row counts,
decisions, dataset samples) in `score/runs/<run_id>/stages/<stage>.json`. The run record
`score/runs/<run_id>.json` is written when the run starts and when it ends. The gold table is written
to `score/gold/score_par_titre/latest.json` (plus a dated copy), the key the API reads.
"""
