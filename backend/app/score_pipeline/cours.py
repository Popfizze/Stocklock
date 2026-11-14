"""Bronze `cours_bruts` (Yahoo Finance in batches, Stooq as fallback) and silver `cours_propres`."""

from __future__ import annotations

import io
from datetime import date, timedelta
from typing import Any

import pandas as pd

from app.score_pipeline import net
from app.score_pipeline import store as st
from app.score_pipeline.runs import RunContext, StageRecorder

BATCH = 50
PERIOD = "2y"
FX_SYMBOL = "CAD=X"          # Yahoo: Canadian dollars per US dollar
STOOQ_URL = "https://stooq.com/q/d/l/"
MAX_FILL_DAYS = 5
INACTIVE_DAYS = 10
RAW_COLUMNS = ["date", "symbol", "open", "high", "low", "close", "adj_close", "volume", "source"]


def _download(symbols: list[str]) -> pd.DataFrame:
    import yfinance as yf

    return yf.download(symbols, period=PERIOD, interval="1d", auto_adjust=False, actions=False,
                       group_by="ticker", threads=True, progress=False, timeout=30)


def to_long(frame: pd.DataFrame | None, symbols: list[str]) -> pd.DataFrame:
    """Rows (date, symbol, open, high, low, close, adj_close, volume) from yf.download's wide frame."""
    if frame is None or frame.empty:
        return pd.DataFrame(columns=RAW_COLUMNS)
    parts = []
    level0 = set(frame.columns.get_level_values(0)) if isinstance(frame.columns, pd.MultiIndex) else set()
    for symbol in symbols:
        if symbol not in level0:
            continue
        sub = frame[symbol].dropna(subset=["Close"])
        if sub.empty:
            continue
        parts.append(pd.DataFrame({
            "date": [d.date().isoformat() for d in sub.index], "symbol": symbol,
            "open": sub.get("Open"), "high": sub.get("High"), "low": sub.get("Low"), "close": sub["Close"],
            "adj_close": sub["Adj Close"] if "Adj Close" in sub else sub["Close"],
            "volume": sub.get("Volume"), "source": "yahoo",
        }).reset_index(drop=True))
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=RAW_COLUMNS)


def stooq_symbol(symbol: str) -> str | None:
    """Stooq covers US listings (`aapl.us`); not the TSX."""
    if symbol.endswith((".TO", ".V")) or "=" in symbol:
        return None
    return symbol.lower() + ".us"


def fetch_stooq(symbol: str, start: date) -> pd.DataFrame:
    code = stooq_symbol(symbol)
    if code is None:
        raise LookupError("Stooq ne couvre pas ce marché")
    resp = net.get("Stooq", STOOQ_URL, params={"s": code, "i": "d", "d1": start.strftime("%Y%m%d")}, timeout_s=20,
                   retries=1)
    text = resp.text
    if not text.startswith("Date"):
        raise LookupError(f"réponse Stooq inattendue ({text[:60]!r})")
    raw = pd.read_csv(io.StringIO(text))
    return pd.DataFrame({"date": raw["Date"], "symbol": symbol, "open": raw["Open"], "high": raw["High"],
                         "low": raw["Low"], "close": raw["Close"], "adj_close": raw["Close"],
                         "volume": raw.get("Volume"), "source": "stooq"})


def bronze(ctx: RunContext, store: st.Store, rec: StageRecorder, deadline: float) -> None:
    univ = st.get_csv(store, ctx.key("silver", "univers", "univers.csv"))
    symbols = [*univ["symbol"].tolist(), FX_SYMBOL]
    parts: list[pd.DataFrame] = []
    got: set[str] = set()
    for attempt in range(2):
        todo = [s for s in symbols if s not in got]
        for i in range(0, len(todo), BATCH):
            batch = todo[i:i + BATCH]
            try:
                part = to_long(_download(batch), batch)
            except Exception as exc:
                rec.warnings.append(f"Lot Yahoo {i // BATCH + 1} (essai {attempt + 1}) en échec : {type(exc).__name__}")
                continue
            parts.append(part)
            got.update(part["symbol"].unique())
    missing = [s for s in symbols if s not in got]
    rec.decide("source", f"Yahoo Finance : téléchargement par lots de {BATCH} titres, {PERIOD} de séances "
                         "(ouverture, haut, bas, clôture, clôture ajustée, volume)", len(got))
    start = date.fromisoformat(ctx.date) - timedelta(days=740)
    rescued = 0
    for symbol, frame, err in net.parallel(missing, lambda s: fetch_stooq(s, start), workers=3, deadline=deadline):
        if err is None and frame is not None and len(frame):
            parts.append(frame)
            got.add(symbol)
            rescued += 1
    rec.decide("fallback", "Titres sans cours Yahoo repris chez Stooq (clôture déjà ajustée des fractionnements)",
               rescued)
    still = [s for s in symbols if s not in got]
    rec.decide("missing", "Titres sans aucun cours (sous-score momentum et risque manquant)", len(still))
    if still:
        rec.warnings.append("Sans cours : " + ", ".join(still[:30]))
    raw = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=RAW_COLUMNS)
    st.put_csv(store, rec.output(ctx.key("bronze", "cours_bruts", "cours_bruts.csv.gz")), raw)
    rec.rows["cours_bruts"] = len(raw)
    rec.rows["titres"] = len(got)
    rec.source("yahoo_prices", "Yahoo Finance (cours quotidiens)", "https://finance.yahoo.com/")
    if rescued:
        rec.source("stooq", "Stooq (cours quotidiens)", "https://stooq.com/")
    rec.add_sample("cours_bruts", raw.tail(6) if len(raw) else raw)


def clean(raw: pd.DataFrame, countries: dict[str, str], run_date: date) -> tuple[pd.DataFrame, dict[str, int]]:
    """Adjusted closes on each market's calendar (gaps up to 5 sessions forward-filled), inactive titles dropped."""
    counts = {"sans_cloture_ajustee": 0, "valeurs_comblees": 0, "hors_calendrier": 0, "inactifs": 0}
    raw = raw.copy()
    raw["date"] = pd.to_datetime(raw["date"])
    no_adj = raw["adj_close"].isna()
    counts["sans_cloture_ajustee"] = int(no_adj.sum())
    raw.loc[no_adj, "adj_close"] = raw.loc[no_adj, "close"]
    raw = raw[raw["adj_close"] > 0].drop_duplicates(["symbol", "date"], keep="first")
    raw["market"] = raw["symbol"].map(lambda s: countries.get(s, "FX"))
    out = []
    for market, group in raw.groupby("market"):
        n_symbols = group["symbol"].nunique()
        per_day = group.groupby("date")["symbol"].nunique()
        calendar = per_day[per_day >= max(1, n_symbols * 0.5)].index.sort_values()
        for symbol, s in group.groupby("symbol"):
            s = s.set_index("date").sort_index()
            last_real = s.index.max()
            if (pd.Timestamp(run_date) - last_real).days > INACTIVE_DAYS:
                counts["inactifs"] += 1
                continue
            cal = calendar[(calendar >= s.index.min()) & (calendar <= calendar.max())]
            counts["hors_calendrier"] += int((~s.index.isin(cal)).sum())
            aligned = s.reindex(cal)
            filled = aligned["adj_close"].isna()
            aligned["adj_close"] = aligned["adj_close"].ffill(limit=MAX_FILL_DAYS)
            aligned["volume"] = aligned["volume"].fillna(0)
            counts["valeurs_comblees"] += int((filled & aligned["adj_close"].notna()).sum())
            aligned = aligned.dropna(subset=["adj_close"])
            out.append(pd.DataFrame({"date": aligned.index.date.astype(str), "symbol": symbol, "market": market,
                                     "adj_close": aligned["adj_close"].values, "volume": aligned["volume"].values,
                                     "filled": filled.loc[aligned.index].values}))
    frame = pd.concat(out, ignore_index=True) if out else pd.DataFrame(
        columns=["date", "symbol", "market", "adj_close", "volume", "filled"])
    return frame, counts


def silver(ctx: RunContext, store: st.Store, rec: StageRecorder, deadline: float) -> None:
    raw = st.get_csv(store, ctx.key("bronze", "cours_bruts", "cours_bruts.csv.gz"))
    univ = st.get_csv(store, ctx.key("silver", "univers", "univers.csv"))
    countries: dict[str, Any] = dict(zip(univ["symbol"], univ["country"], strict=False))
    frame, counts = clean(raw, countries, date.fromisoformat(ctx.date))
    st.put_csv(store, rec.output(ctx.key("silver", "cours_propres", "cours_propres.csv.gz")), frame)
    rec.rows["cours_propres"] = len(frame)
    rec.rows["titres"] = int(frame["symbol"].nunique()) if len(frame) else 0
    rec.decide("info", "Clôture ajustée des fractionnements et dividendes (Yahoo « Adj Close ») ; "
                       "à défaut, clôture brute", counts["sans_cloture_ajustee"])
    rec.decide("info", "Calendrier par marché (États-Unis, Canada) : séances où au moins la moitié des titres "
                       f"ont coté ; trous de {MAX_FILL_DAYS} séances au plus comblés par la dernière clôture",
               counts["valeurs_comblees"])
    rec.decide("filter", "Cotations hors du calendrier du marché retirées", counts["hors_calendrier"])
    rec.decide("filter", f"Titres inactifs retirés (dernière cotation il y a plus de {INACTIVE_DAYS} jours)",
               counts["inactifs"])
    rec.add_sample("cours_propres", frame.groupby("symbol").tail(1).head(8) if len(frame) else frame)
