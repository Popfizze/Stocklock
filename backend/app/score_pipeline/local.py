"""Run the whole score pipeline on this machine, into a local folder laid out like the bucket.

    cd backend && python -m app.score_pipeline.local --max-titles 12 --out ../build/score-local

Real sources (SEC, TMX, Yahoo, GDELT, Federal Register); Bedrock needs AWS credentials, or pass
--no-llm to skip the event extraction (every title's events sub-score is then missing).
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from app.score_pipeline import evenements, stages
from app.score_pipeline import store as st
from app.score_pipeline.runs import STAGE_IDS


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-titles", type=int, default=12)
    parser.add_argument("--out", type=Path, default=Path("../build/score-local"))
    parser.add_argument("--no-llm", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    store = st.FileStore(args.out)
    if args.no_llm:
        def no_llm(request: dict) -> dict:
            raise RuntimeError("Bedrock désactivé (--no-llm)")

        stages.RUNNERS["silver_evenements"] = lambda c, s, r, d: evenements.silver(c, s, r, d, converse=no_llm)
    run = stages.handle({"stage": "init", "execution_name": stages.new_run_id(),
                         "input": {"trigger": "local", "params": {"max_titles": args.max_titles}}}, store)["run"]
    try:
        for stage in STAGE_IDS:
            result = stages.handle({"stage": stage, "run": run}, store, remaining_ms=900_000)
            print(f"{stage:20s} {result['duration_s']:>7.1f} s  {result['rows']}")
    except Exception as exc:
        stages.handle({"stage": "fail", "run": run, "error": {"Error": type(exc).__name__, "Cause": str(exc)}}, store)
        raise
    done = stages.handle({"stage": "finalize", "run": run}, store)
    print(json.dumps(done, indent=1, ensure_ascii=False))
    print("output:", store.base)


if __name__ == "__main__":
    main()
