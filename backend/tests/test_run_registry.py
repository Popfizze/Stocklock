"""Run registry: Labo runs stored in full (single, group and titles), score pipeline runs read, one API."""

import gzip
import json

import pytest

from app.pipeline import core
from app.registry import lab
from app.registry import store as rs

from .test_api_lab_and_routes import TAX_INPUTS

BIAS = {"message": "Tout le monde achète NVDA, je mets toute ma retraite dessus !"}
LEXICON = {"narration.model": "none", "message_analysis.method": "lexicon"}
SCORE_RUN = "20261114T060000Z-0f9e8d"


def _run(client, step, inputs, options=None, persona="amira"):
    r = client.post("/api/lab/run", json={"step": step, "persona_id": persona, "inputs": inputs,
                                          "options": options or {"narration.model": "none"}})
    assert r.status_code == 200, r.text
    return r.json()


def _list(client, **params):
    r = client.get("/api/runs", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _seed_score_run(status="succeeded"):
    """A score pipeline run as the pipeline writes it: record, stages inline, outputs in the bucket."""
    store = rs.get_store()
    csv_key = f"score/silver/univers/2026-11-14/{SCORE_RUN}/univers.csv"
    json_key = f"score/gold/score_par_titre/2026-11-14/{SCORE_RUN}/score_par_titre.json"
    gz_key = f"score/bronze/titres_bruts/2026-11-14/{SCORE_RUN}/yahoo_screeners.json.gz"
    store.put_bytes(csv_key, b"symbol,name,sector\nAAPL,Apple,Technology\nRY.TO,Royal Bank,\n")
    store.put_bytes(json_key, json.dumps({"schema_version": 1, "run_id": SCORE_RUN, "rows": [
        {"symbol": "AAPL", "score": 78.0}, {"symbol": "RY.TO", "score": 64.5}]}).encode())
    store.put_bytes(gz_key, gzip.compress(json.dumps({"us_actions": {"total": 2}}).encode()))
    stage = {"id": "silver_univers", "layer": "silver", "label": "Univers", "status": "succeeded",
             "duration_s": 3.2, "decisions": [{"kind": "filter", "message": "Doublons retirés", "count": 2}],
             "samples": [{"dataset": "univers", "columns": ["symbol"], "rows": [["AAPL"]], "total_rows": 2}],
             "warnings": [], "outputs": [csv_key], "error": None}
    gold = {**stage, "id": "gold", "layer": "gold", "label": "Score par titre", "outputs": [json_key, gz_key],
            "decisions": [], "samples": []}
    record = {"run_id": SCORE_RUN, "status": status, "trigger": "schedule", "date": "2026-11-14",
              "params": {"max_titles": 200}, "started_at": "2026-11-14T06:00:00Z",
              "finished_at": "2026-11-14T06:20:00Z", "duration_s": 1200.0,
              "summary": {"titles_scored": 2, "top": []}, "error": None, "stages": [stage, gold]}
    rs.put_json(store, f"score/runs/{SCORE_RUN}.json", record)
    return csv_key, json_key, gz_key


def test_a_lab_run_is_stored_with_its_stages_decisions_and_datasets(client):
    body = _run(client, "tax", TAX_INPUTS, persona="mateo")
    page = _list(client)
    assert [r["run_id"] for r in page["runs"]] == [body["run_id"]] and page["next_cursor"] is None
    summary = page["runs"][0]
    assert {k: summary[k] for k in ("pipeline", "pipeline_label", "kind", "trigger", "persona_id", "title")} == {
        "pipeline": "lab.tax", "pipeline_label": "Labo · 3. Fiscalité", "kind": "single", "trigger": "labo",
        "persona_id": "mateo", "title": "3. Fiscalité"}
    assert summary["key_result"] == body["key_result"] and summary["governance_passed"] is True
    detail = client.get(f"/api/runs/{body['run_id']}").json()
    assert detail["inputs"]["annual_contribution"] == 7000 and detail["options"] == body["options_used"]
    assert [s["id"] for s in detail["stages"]] == [s["id"] for s in body["stages"]]
    rules = next(s for s in detail["stages"] if s["id"] == "rules")
    assert rules["layer"] == "bronze" and rules["decisions"] >= 3
    assert {d["id"]: d["rows"] for d in rules["datasets"]}["rules"] > 40
    assert detail["result"]["governance"]["passed"] is True
    stage = client.get(f"/api/runs/{body['run_id']}/stages/rules").json()
    assert stage["pipeline"] == "lab" and stage["stage"]["decisions"] == _stage(body, "rules")["decisions"]
    arts = {a["id"]: a for a in client.get(f"/api/runs/{body['run_id']}/artifacts").json()["artifacts"]}
    assert {"lab:rules:dataset:rules", "lab:rules:decisions"} <= set(arts)
    prev = client.get(f"/api/runs/{body['run_id']}/artifacts/lab:rules:dataset:rules",
                      params={"offset": 5, "limit": 10}).json()
    rows = _dataset(body, "rules", "rules")["rows"]
    assert prev["rows"] == rows[5:15] and prev["total_rows"] == len(rows) and prev["has_more"] is True
    dec = client.get(f"/api/runs/{body['run_id']}/artifacts/lab:rules:decisions").json()
    assert dec["columns"] == ["question", "answer", "reason", "rule", "inputs"] and dec["rows"][0][0]


def _stage(body, stage_id):
    return next(s for s in body["stages"] if s["id"] == stage_id)


def _dataset(body, stage_id, dataset_id):
    return next(d for d in _stage(body, stage_id)["datasets"] if d["id"] == dataset_id)


def test_the_registry_keeps_every_row_even_when_the_response_was_cut(client, monkeypatch):
    monkeypatch.setattr(core, "RESPONSE_MAX_BYTES", 60_000)
    body = _run(client, "bias", BIAS, LEXICON, persona="robert")
    cut = _dataset(body, "hype_signal", "prices_NVDA")
    assert cut["truncated"] and len(cut["rows"]) < cut["total_rows"]
    aid = "lab:hype_signal:dataset:prices_NVDA"
    last = client.get(f"/api/runs/{body['run_id']}/artifacts/{aid}",
                      params={"offset": cut["total_rows"] - 2, "limit": 500}).json()
    assert last["total_rows"] == cut["total_rows"] and len(last["rows"]) == 2 and not last["has_more"]
    stage = client.get(f"/api/runs/{body['run_id']}/stages/hype_signal").json()["stage"]
    assert stage["datasets"][0]["total_rows"] == cut["total_rows"]  # cut again only to fit this response


def test_a_group_run_is_stored_with_one_child_run_per_title(client):
    r = client.post("/api/lab/run-batch", json={"step": "bias", "persona_id": "robert", "inputs": BIAS,
                                                "options": LEXICON,
                                                "group": {"kind": "tickers", "tickers": ["NVDA", "TSLA", "ZZZZZZ"]}})
    batch = r.json()
    page = _list(client)
    assert [x["run_id"] for x in page["runs"]] == [batch["batch_id"]]  # titles are not listed on their own
    parent = page["runs"][0]
    assert parent["kind"] == "batch" and parent["child_count"] == 3 and parent["status"] == "warning"
    assert parent["title"].startswith("Groupe · Titres choisis (3 titres)")
    detail = client.get(f"/api/runs/{batch['batch_id']}").json()
    assert detail["group"]["tickers"] == ["NVDA", "TSLA", "ZZZZZZ"] and detail["table"] == batch["table"]
    children = {c["title"]: c for c in detail["children"]}
    assert set(children) == {i["ticker"] for i in batch["items"] if i["run_id"]} >= {"NVDA", "TSLA"}
    # A title without a run of its own is kept with its status and its reason.
    assert [(u["ticker"], u["status"]) for u in detail["unfinished"]] == \
        [(i["ticker"], i["status"]) for i in batch["items"] if i["run_id"] is None]
    assert all(u["error"] for u in detail["unfinished"])
    nvda = next(i for i in batch["items"] if i["ticker"] == "NVDA")
    assert children["NVDA"]["run_id"] == nvda["run_id"] and children["NVDA"]["parent_id"] == batch["batch_id"]
    child = client.get(f"/api/runs/{nvda['run_id']}").json()
    assert child["kind"] == "batch_item" and any(s["datasets"] for s in child["stages"])
    arts = [a["id"] for a in client.get(f"/api/runs/{batch['batch_id']}/artifacts").json()["artifacts"]]
    assert arts == ["lab:batch:table", "lab:batch:items"]
    items = client.get(f"/api/runs/{batch['batch_id']}/artifacts/lab:batch:items").json()
    assert [row[0] for row in items["rows"]] == ["NVDA", "TSLA", "ZZZZZZ"]
    assert [row[2] for row in items["rows"]] == [i["status"] for i in batch["items"]]


def test_filters_and_cursor_pages_newest_first(client):
    ids = [_run(client, "tax", TAX_INPUTS, persona=p)["run_id"] for p in ("mateo", "amira", "mateo")]
    bias = _run(client, "bias", BIAS, LEXICON, persona="robert")["run_id"]
    _seed_score_run()
    everything = _list(client, limit=100)["runs"]
    assert [r["run_id"] for r in everything] == [bias, *reversed(ids), SCORE_RUN]
    assert [r["run_id"] for r in _list(client, persona="mateo")["runs"]] == [ids[2], ids[0]]
    assert [r["run_id"] for r in _list(client, pipeline="lab.tax")["runs"]] == list(reversed(ids))
    assert len(_list(client, pipeline="lab")["runs"]) == 4
    assert [r["run_id"] for r in _list(client, pipeline="score_pipeline")["runs"]] == [SCORE_RUN]
    assert [r["run_id"] for r in _list(client, trigger="schedule")["runs"]] == [SCORE_RUN]
    seen, cursor = [], None
    while True:
        page = _list(client, limit=2, **({"cursor": cursor} if cursor else {}))
        seen += [r["run_id"] for r in page["runs"]]
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert seen == [r["run_id"] for r in everything]
    assert client.get("/api/runs", params={"cursor": "pas-un-curseur"}).status_code == 422


def test_since_and_until_keep_the_runs_started_in_the_period(client):
    lab_id = _run(client, "tax", TAX_INPUTS)["run_id"]
    _seed_score_run()
    runs = {r["run_id"]: r["started_at"] for r in _list(client, limit=100)["runs"]}
    assert set(runs) == {lab_id, SCORE_RUN}
    lab_day, score_day = runs[lab_id][:10], runs[SCORE_RUN][:10]  # the seeded score run is the older one

    def ids(**params):
        return [r["run_id"] for r in _list(client, limit=100, **params)["runs"]]

    # A date is the whole UTC day, both bounds inclusive.
    assert ids(since=score_day, until=lab_day) == [lab_id, SCORE_RUN]
    assert SCORE_RUN in ids(until=score_day) and SCORE_RUN in ids(since=score_day, until=score_day)
    assert ids(since="2026-11-13", until="2026-11-13") == []
    assert ids(until="2026-11-13") == [] and ids(since="2999-01-01") == []
    # A date-time: inclusive lower bound, exclusive upper bound.
    assert ids(since=runs[lab_id]) == [lab_id]
    assert ids(until=runs[lab_id]) == [SCORE_RUN]
    assert ids(until=runs[SCORE_RUN]) == []
    assert ids(since="2026-11-14T06:00:00Z", until="2026-11-14T06:00:01+00:00") == [SCORE_RUN]
    assert _list(client, since=runs[lab_id])["next_cursor"] is None
    for bad in ({"since": "hier"}, {"since": "2026-11-15", "until": "2026-11-14"}):
        assert client.get("/api/runs", params=bad).status_code == 422


def test_score_pipeline_runs_are_read_with_their_files(client):
    csv_key, json_key, gz_key = _seed_score_run()
    detail = client.get(f"/api/runs/{SCORE_RUN}").json()
    assert detail["pipeline"] == "score_pipeline" and detail["kind"] == "pipeline" and detail["persona_id"] is None
    assert detail["key_result"] == {"label": "Titres notés", "value": 2} and detail["params"]["max_titles"] == 200
    assert detail["stages"][0] == {"id": "silver_univers", "name": "Univers", "layer": "silver", "status": "succeeded",
                                   "duration_ms": 3200.0, "warnings": 0, "decisions": 1,
                                   "datasets": [{"id": "univers", "title": "univers", "source_id": None, "rows": 2,
                                                 "columns": 1}]}
    stage = client.get(f"/api/runs/{SCORE_RUN}/stages/silver_univers").json()
    assert stage["pipeline"] == "score_pipeline" and stage["stage"]["outputs"] == [csv_key]
    arts = {a["path"]: a for a in client.get(f"/api/runs/{SCORE_RUN}/artifacts").json()["artifacts"]}
    assert set(arts) == {csv_key, json_key, gz_key}
    assert arts[csv_key]["format"] == "csv" and arts[csv_key]["size_bytes"] > 0 and arts[gz_key]["format"] == "json"
    csv = client.get(f"/api/runs/{SCORE_RUN}/artifacts/{arts[csv_key]['id']}").json()
    assert csv["columns"] == ["symbol", "name", "sector"] and csv["rows"] == [["AAPL", "Apple", "Technology"],
                                                                          ["RY.TO", "Royal Bank", None]]
    gold = client.get(f"/api/runs/{SCORE_RUN}/artifacts/{arts[json_key]['id']}").json()
    assert gold["columns"] == ["symbol", "score"] and gold["total_rows"] == 2 and "rows" in gold["note"]
    raw = client.get(f"/api/runs/{SCORE_RUN}/artifacts/{arts[gz_key]['id']}").json()
    assert raw["columns"] == ["clé", "valeur"] and raw["rows"] == [["us_actions.total", 2]]
    from app.registry.artifacts import _file_id
    outside = _file_id("lab/index/secret.json")  # not an output of this run
    assert client.get(f"/api/runs/{SCORE_RUN}/artifacts/{outside}").status_code == 404
    assert _list(client, persona="amira")["runs"] == []  # the score pipeline has no profile


def test_unknown_runs_and_parts_are_404(client):
    body = _run(client, "tax", TAX_INPUTS, persona="mateo")
    for path in ("/api/runs/nope", "/api/runs/bad%20id", f"/api/runs/{body['run_id']}/stages/nope",
                 f"/api/runs/{body['run_id']}/artifacts/lab:nope:decisions", "/api/runs/nope/artifacts"):
        assert client.get(path).status_code == 404, path


def test_a_storage_failure_never_breaks_a_run(client, monkeypatch):
    def broken(*args, **kwargs):
        raise OSError("bucket indisponible")

    monkeypatch.setattr(rs, "put_json", broken)
    body = _run(client, "tax", TAX_INPUTS, persona="mateo")
    assert body["key_result"]["value"] is not None
    assert _list(client)["runs"] == []


def test_index_keys_sort_newest_first_and_carry_the_filters():
    old = lab.index_key({"run_id": "a1", "pipeline": "lab.tax", "persona_id": None, "status": "failed",
                         "trigger": "labo", "started_at": "2026-11-14T10:00:00.000Z"})
    new = lab.index_key({"run_id": "b2", "pipeline": "lab.score", "persona_id": "amira", "status": "warning",
                         "trigger": "labo", "started_at": "2026-11-14T10:00:01.000Z"})
    assert new < old
    parsed = lab.parse_index_key(new)
    assert {k: parsed[k] for k in ("run_id", "pipeline", "persona_id", "status", "trigger")} == {
        "run_id": "b2", "pipeline": "lab.score", "persona_id": "amira", "status": "warning", "trigger": "labo"}
    assert lab.parse_index_key(old)["persona_id"] is None and lab.parse_index_key("lab/index/x.json") is None


class _ClientError(Exception):
    def __init__(self, code):
        self.response = {"Error": {"Code": code}}


class _FakeS3:
    """The four boto3 S3 calls the registry makes, on a dict."""

    def __init__(self):
        self.objects, self.calls = {}, []

    def put_object(self, Bucket, Key, Body, ContentType):
        self.objects[Key] = Body

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise _ClientError("NoSuchKey")
        body = self.objects[Key]
        return {"Body": type("B", (), {"read": lambda self: body})()}

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise _ClientError("404")
        return {"ContentLength": len(self.objects[Key])}

    def list_objects_v2(self, Bucket, Prefix, MaxKeys, StartAfter=""):
        self.calls.append(StartAfter)
        keys = sorted(k for k in self.objects if k.startswith(Prefix) and k > StartAfter)
        return {"Contents": [{"Key": k} for k in keys[:MaxKeys]], "IsTruncated": len(keys) > MaxKeys}


def test_s3_store_maps_missing_keys_and_pages_listings():
    s3 = _FakeS3()
    store = rs.S3Store("bucket", s3)
    for i in range(3):
        rs.put_json(store, f"lab/index/{i}.json", {"i": i})
    assert rs.get_json(store, "lab/index/1.json") == {"i": 1} and store.size("lab/index/1.json") == 7
    with pytest.raises(rs.NotFound):
        store.get_bytes("lab/runs/none/run.json.gz")
    with pytest.raises(rs.NotFound):
        store.size("lab/runs/none/run.json.gz")
    assert store.list_page("lab/index/", max_keys=2) == (["lab/index/0.json", "lab/index/1.json"], True)
    assert store.list_page("lab/index/", "lab/index/1.json", 2) == (["lab/index/2.json"], False)


@pytest.mark.parametrize("value, rows", [
    ([{"a": 1}, {"b": 2}], [[1, None], [None, 2]]),
    ({"meta": 1, "rows": [{"a": 1}]}, [[1]]),
    ({"x": {"y": [1, 2]}}, [["x.y", "[1, 2]"]]),
])
def test_json_files_become_tables(value, rows):
    from app.registry.artifacts import _json_table

    columns, table, _ = _json_table(value)
    assert [[core._cell(v) for v in r] for r in table] == rows and columns
