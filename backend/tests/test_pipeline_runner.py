import pytest
from pydantic import BaseModel

from app.personas import get_persona
from app.pipeline import core
from app.pipeline.core import Choice, InputSpec, OptionSpec, StageSkipped, StageSpec, StepSpec
from app.pipeline.registry import STEPS, catalog, execute

TAX_INPUTS = {"annual_contribution": 7000, "years": 15, "expected_return": 0.05, "marginal_rate_now": 0.3612,
              "marginal_rate_retirement": 0.3012, "first_home_buyer": True, "income": 85000}


class _In(BaseModel):
    x: int = 1


def _toy_step(fail_degradable=True):
    def ok(ctx):
        ctx.metric("valeur", ctx.opt("mode"))
        ctx.state["seen"] = ["ok"]

    def boom(ctx):
        raise RuntimeError("source en panne")

    def after(ctx):
        ctx.state["seen"].append("after")
        ctx.preview(["i"], [[i] for i in range(50)])

    def skip(ctx):
        raise StageSkipped("rien à faire")

    return StepSpec(
        id="toy", label="Toy", inputs=(InputSpec("x", "X", "number", 1),),
        stages=(StageSpec("a", "A", "", ok, (OptionSpec("mode", "Mode", (Choice("p", "P"), Choice("q", "Q")), "p"),)),
                StageSpec("b", "B", "", boom, degradable=fail_degradable),
                StageSpec("c", "C", "", after),
                StageSpec("d", "D", "", skip)),
        request_model=_In, key_result=lambda ctx: {"label": "k", "value": len(ctx.state.get("seen", []))})


def test_defaults_are_applied():
    res = core.run(_toy_step(), get_persona("amira"), _In())
    assert res.options_used == {"a.mode": "p"}
    assert res.stages[0]["options_used"] == {"a.mode": "p"}
    assert res.stages[0]["metrics"]["valeur"] == "p"


def test_partial_options_override_defaults():
    res = core.run(_toy_step(), get_persona("amira"), _In(), {"a.mode": "q"})
    assert res.options_used["a.mode"] == "q"


@pytest.mark.parametrize("opts", [{"a.mode": "zzz"}, {"a.unknown": "p"}, {"nope.mode": "p"}])
def test_invalid_option_raises(opts):
    with pytest.raises(core.OptionError):
        core.run(_toy_step(), get_persona("amira"), _In(), opts)


def test_failing_degradable_stage_becomes_warning_and_pipeline_continues():
    res = core.run(_toy_step(), get_persona("amira"), _In())
    status = {s["id"]: s["status"] for s in res.stages}
    assert status == {"a": "ok", "b": "warning", "c": "ok", "d": "skipped"}
    assert res.context.state["seen"] == ["ok", "after"]
    assert "source en panne" in res.stages[1]["warnings"][0]
    assert len(res.stages[2]["preview"]["rows"]) == core.PREVIEW_MAX_ROWS
    assert not res.failed


def test_failing_critical_stage_errors_and_skips_the_rest():
    res = core.run(_toy_step(fail_degradable=False), get_persona("amira"), _In())
    status = {s["id"]: s["status"] for s in res.stages}
    assert status == {"a": "ok", "b": "error", "c": "skipped", "d": "skipped"}
    assert res.failed


def test_catalog_matches_runner():
    cat = catalog()
    assert [s["id"] for s in cat["steps"]] == ["score", "explain_move", "tax", "bias"]
    assert [s["label"] for s in cat["steps"]] == ["1. Score", "2. Fluctuations", "3. Fiscalité", "4. Biais"]
    for step in cat["steps"]:
        spec = STEPS[step["id"]]
        assert [s["id"] for s in step["stages"]] == [s.id for s in spec.stages]
        keys = {f"{s['id']}.{o['key']}" for s in step["stages"] for o in s["options"]}
        assert keys == set(spec.defaults())
        for s in step["stages"]:
            for o in s["options"]:
                assert o["default"] in [c["value"] for c in o["choices"]]
        for i in step["inputs"]:
            assert i["type"] in {"text", "textarea", "date", "number", "tickers", "boolean"}
    # narration: route default haiku, Lab default none
    narr = next(s for s in cat["steps"][0]["stages"] if s["id"] == "narration")["options"][0]
    assert narr["default"] == "haiku" and narr["lab_default"] == "none"


def test_runner_options_used_cover_catalog_for_a_real_step():
    res, _ = execute("tax", get_persona("mateo"), TAX_INPUTS, {"narration.model": "none"})
    assert set(res.options_used) == set(STEPS["tax"].defaults())
    assert [s["id"] for s in res.stages] == [s.id for s in STEPS["tax"].stages]


def test_narration_failure_degrades_to_deterministic_answer():
    # Bedrock is disabled in tests: default narration (haiku) falls back with a warning
    res, resp = execute("tax", get_persona("mateo"), TAX_INPUTS)
    narr = next(s for s in res.stages if s["id"] == "narration")
    assert narr["status"] == "warning"
    assert resp.governance.passed
    assert "pas un conseil" in resp.answer
