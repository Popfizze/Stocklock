"""Every stage of the Lab catalog says where it sits in the diagram: bronze, silver, gold or sortie."""

from __future__ import annotations

from app.pipeline.registry import STEPS

LAYERS = ("bronze", "silver", "gold", "sortie")


def test_every_stage_of_the_catalog_has_a_layer(client):
    steps = client.get("/api/lab/pipelines").json()["steps"]
    assert {s["id"] for s in steps} == set(STEPS)
    for step in steps:
        assert step["stages"], step["id"]
        for stage in step["stages"]:
            assert stage["layer"] in LAYERS, (step["id"], stage["id"], stage.get("layer"))


def test_layers_follow_the_flow_bronze_to_sortie(client):
    """A pipeline starts on raw data and ends on its narration and governance."""
    for step in client.get("/api/lab/pipelines").json()["steps"]:
        layers = [stage["layer"] for stage in step["stages"]]
        assert "bronze" in layers and "gold" in layers, step["id"]
        by_id = {stage["id"]: stage["layer"] for stage in step["stages"]}
        assert by_id["narration"] == "sortie" and by_id["governance"] == "sortie"
        # Nothing is computed after the output stages.
        first_output = layers.index("sortie")
        assert set(layers[first_output:]) == {"sortie"}, step["id"]


def test_the_catalog_layer_is_the_stage_spec_layer(client):
    steps = {s["id"]: s for s in client.get("/api/lab/pipelines").json()["steps"]}
    for step_id, spec in STEPS.items():
        assert [s["layer"] for s in steps[step_id]["stages"]] == [s.layer for s in spec.stages]
    assert {s.id: s.layer for s in STEPS["score"].stages}["scoring"] == "gold"
    assert {s.id: s.layer for s in STEPS["tax"].stages}["rules"] == "bronze"
