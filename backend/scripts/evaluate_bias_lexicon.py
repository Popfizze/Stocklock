"""Print the repeatable French bias-lexicon validation report.

Run from ``backend`` with: ``python scripts/evaluate_bias_lexicon.py``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Running this file directly makes ``scripts`` the import root; add ``backend`` explicitly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.bias_validation import evaluate_lexicon


if __name__ == "__main__":
    print(json.dumps(evaluate_lexicon(), ensure_ascii=False, indent=2))
