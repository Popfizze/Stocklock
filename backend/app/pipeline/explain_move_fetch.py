"""Step 2, fast: the independent sources are fetched side by side, within the stock page's time budget.

- `Budget`: the stock route's time budget, seeded in the run's state; a Lab run has none and waits for
  every source as before;
- `start(ctx)`: as soon as the title is identified, the EDGAR filings, the Federal Register documents,
  GDELT's coverage (the title's, then the tariffs' and sanctions': GDELT accepts one request every 5 s)
  and Yahoo's news are fetched in a bounded pool while the next stages compute, and the AgentCore
  session is started;
- `get(ctx, name, fetch)`: a stage's prefetched result, waited for until the budget's fetch deadline;
  past it, `OverBudget`: the stage records the source as left out (decision and warning), never silently;
- `parallel(fn, chunks)`: model calls on several chunks at once (event digests, link judgements).
"""

from __future__ import annotations

import time
from collections.abc import Callable, Sequence
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from typing import Any, TypeVar

from app.data import edgar, federal_register, gdelt, yf_live
from app.data.cache import OverBudget
from app.pipeline.core import Context
from app.services import narration

FETCH_BUDGET_S = 2.0   # EDGAR and the Federal Register answer in well under a second; GDELT often in 10 s with a 429
CRAWL_BUDGET_S = 3.0   # 8-K exhibit indexes and pages, read side by side
TOTAL_BUDGET_S = 15.0  # what the stock page waits for a first answer at most
RETRY_S = 6.0          # a second narration (governance retry) with Haiku on a warm session
POOL_WORKERS = 6
MODEL_WORKERS = 8

SOURCES = {"edgar": "SEC EDGAR", "federal_register": "Federal Register", "news": "Yahoo Finance",
           "gdelt_title": gdelt.SOURCE, "gdelt_political": gdelt.SOURCE}

# Shared by the requests of the process and bounded: a source still loading when its stage gave up keeps
# its thread until its own timeout, and its answer lands in the disk cache for the next request.
_POOL = ThreadPoolExecutor(max_workers=POOL_WORKERS, thread_name_prefix="moves-fetch")
_MODEL_POOL = ThreadPoolExecutor(max_workers=MODEL_WORKERS, thread_name_prefix="moves-model")

T = TypeVar("T")
R = TypeVar("R")


@dataclass
class Budget:
    """Time budget of one stock-page analysis (seconds from `started`, time.monotonic())."""
    started: float = field(default_factory=time.monotonic)
    fetch_s: float = FETCH_BUDGET_S
    crawl_s: float = CRAWL_BUDGET_S
    total_s: float = TOTAL_BUDGET_S
    retry_s: float = RETRY_S
    skipped: list[str] = field(default_factory=list)  # what the budget left out, in order

    def elapsed(self) -> float:
        return time.monotonic() - self.started

    def remaining(self) -> float:
        return self.total_s - self.elapsed()

    def allows(self, seconds: float) -> bool:
        return self.remaining() >= seconds

    def skip(self, what: str) -> None:
        if what not in self.skipped:
            self.skipped.append(what)


def budget_of(ctx: Context) -> Budget | None:
    budget = ctx.state.get("budget")
    return budget if isinstance(budget, Budget) else None


def deadline(ctx: Context, seconds: float) -> float | None:
    """time.monotonic() deadline `seconds` from now under a budget, None without one."""
    return None if budget_of(ctx) is None else time.monotonic() + seconds


def _uses_haiku(ctx: Context) -> bool:
    return any(ctx.options.get(k) in {"haiku", "sonnet"} for k in ("digest.model", "plausibility.model",
                                                                    "narration.model"))


def _chained(jobs: list[tuple[str, Callable[[], Any]]], until: float | None) -> dict[str, Future]:
    """Runs GDELT `jobs` one after the other in one pool thread (its throttle serves them in this order),
    none waiting for a slot past `until`; each gets its own future, set as soon as its job ends."""
    futures: dict[str, Future] = {name: Future() for name, _ in jobs}

    def run() -> None:
        with gdelt.deadline_scope(until):
            for name, job in jobs:
                try:
                    futures[name].set_result(job())
                except BaseException as exc:  # handed to the stage that waits for it
                    futures[name].set_exception(exc)

    _POOL.submit(run)
    return futures


def start(ctx: Context) -> None:
    """Starts every source the next stages need (per their options) and, under a budget, the model session."""
    if budget_of(ctx) is not None and _uses_haiku(ctx):
        narration.warm_up()
    start_day, end_day = ctx.inputs.start, ctx.inputs.end
    ticker, info = ctx.inputs.ticker, ctx.state.get("asset") or {}
    opts = ctx.options
    fetch_deadline = deadline(ctx, budget_of(ctx).fetch_s) if budget_of(ctx) else None
    futures: dict[str, Future] = {}
    if opts.get("company_events.enabled") == "on" and info.get("cik"):
        cik = info["cik"]
        futures["edgar"] = _POOL.submit(edgar.filings_between, cik, start_day, end_day)
    political = opts.get("political_events.source")
    if political in {"both", "federal_register"}:
        sector = f"{info.get('sector') or ''} {info.get('asset_class') or ''}"
        futures["federal_register"] = _POOL.submit(federal_register.policy_documents, start_day, end_day, sector)
    world = opts.get("world_events.source")
    if world == "yfinance_news":
        futures["news"] = _POOL.submit(yf_live.recent_news, ticker)
    gdelt_jobs: list[tuple[str, Callable[[], Any]]] = []
    if world == "gdelt" and info.get("name"):
        gdelt_jobs.append(("gdelt_title", lambda: gdelt.timeline(ticker, info["name"], start_day, end_day)))
    if political in {"both", "gdelt"}:
        gdelt_jobs.append(("gdelt_political",
                           lambda: gdelt.timeline_for_query(gdelt.POLITICAL_QUERY, start_day, end_day)))
    if gdelt_jobs:
        futures.update(_chained(gdelt_jobs, fetch_deadline))
    ctx.state["prefetch"] = futures
    ctx.state["fetch_deadline"] = fetch_deadline


def get(ctx: Context, name: str, fetch: Callable[[], T]) -> T:
    """The prefetched result `name` (or `fetch()` now when nothing was prefetched); raises what the fetch
    raised, or OverBudget once the budget's fetch deadline has passed."""
    future = (ctx.state.get("prefetch") or {}).pop(name, None)
    if future is None:
        return fetch()
    limit = ctx.state.get("fetch_deadline")
    try:
        return future.result(timeout=None if limit is None else max(0.0, limit - time.monotonic()))
    except FutureTimeout:
        budget = budget_of(ctx)
        seconds = budget.fetch_s if budget else 0.0
        raise OverBudget(SOURCES.get(name, name), f"pas de réponse dans le budget de temps ({seconds:g} s)") from None


def over_budget(ctx: Context, exc: OverBudget, what: str, question: str, answer: str, consequence: str,
                rule: str) -> None:
    """Records a source left out by the time budget: decision, warning and the budget's list."""
    budget = budget_of(ctx)
    if budget is not None:
        budget.skip(what)
    ctx.warn(f"{what} laissé(e) de côté : {exc.reason} ; {consequence}", limit=False)
    ctx.decide(question, answer, f"{exc.source} : {exc.reason}. {consequence[0].upper()}{consequence[1:]} La page "
               "répond sans attendre cette source ; une prochaine analyse la reprend (cache).",
               f"{rule} ; budget de temps de la page titre")


def parallel(fn: Callable[[T], R], chunks: Sequence[T]) -> list[tuple[R | None, Exception | None]]:
    """fn(chunk) for every chunk at once (a single chunk runs inline): (result, None) or (None, error)."""
    def one(chunk: T) -> tuple[R | None, Exception | None]:
        try:
            return fn(chunk), None
        except Exception as exc:  # each chunk fails on its own
            return None, exc

    if len(chunks) <= 1:
        return [one(c) for c in chunks]
    return [f.result() for f in [_MODEL_POOL.submit(one, c) for c in chunks]]


def chunked(items: Sequence[T], size: int, most: int | None = None) -> list[list[T]]:
    """`items` in consecutive chunks of at most `size`, balanced (10 by 4 → 4, 3, 3); with `most`, larger
    chunks rather than more than `most` of them (one wave of parallel calls, not two)."""
    if not items:
        return []
    n = -(-len(items) // size)
    if most:
        n = min(n, most)
    base, extra = divmod(len(items), n)
    out, i = [], 0
    for k in range(n):
        step = base + (1 if k < extra else 0)
        out.append(list(items[i:i + step]))
        i += step
    return out
