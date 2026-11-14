"""Lambda `stocklock-collect-score`: runs one stage of the score pipeline (see app/score_pipeline).

The Step Functions state machine `stocklock-score-pipeline` invokes it once per stage with
{"stage": ..., "run": {...}}; the `app` package is copied next to this file by
infra/scripts/build-collectors.sh.
"""

from __future__ import annotations

import logging
import os

# Lambda can only write under /tmp (disk cache of app.data, yfinance's cookie and time-zone caches).
os.environ.setdefault("CACHE_DIR", "/tmp/cache")
os.environ.setdefault("HOME", "/tmp")
os.environ.setdefault("XDG_CACHE_HOME", "/tmp/.cache")

from app.score_pipeline.stages import handle  # noqa: E402
from app.score_pipeline.store import S3Store  # noqa: E402

logging.getLogger().setLevel(logging.INFO)


def handler(event, context):
    if "stage" not in event:
        return {"ignored": True, "reason": "aucune étape : le pipeline est lancé par sa machine à états"}
    remaining = context.get_remaining_time_in_millis() if context is not None else None
    return handle(event, S3Store(os.environ["DATA_BUCKET"]), remaining)
