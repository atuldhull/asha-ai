"""RAG retrieval fallback tests — runs without pgvector or BGE-M3."""
from __future__ import annotations

from app.rag.retriever import retrieve


def test_retrieve_returns_relevant_snippets_for_chest_pain():
    snippets = retrieve("severe chest pain", symptom_tokens=["chest_pain"], k=3)
    assert snippets
    ids = {s.id for s in snippets}
    assert "who_acs_1" in ids


def test_retrieve_returns_stroke_snippet_for_fast_symptoms():
    snippets = retrieve(
        "left arm weakness and slurred speech",
        symptom_tokens=["arm_weakness", "slurred_speech"],
        k=3,
    )
    assert any(s.id == "mohfw_stg_stroke" for s in snippets)


def test_retrieve_falls_back_to_generic_when_no_match():
    snippets = retrieve("unknown gibberish", symptom_tokens=["bogus_symptom"], k=3)
    # Guarantee: always at least one citation.
    assert snippets
    assert snippets[0].source


def test_retrieve_returns_pediatric_snippet_for_child_danger():
    snippets = retrieve(
        "my child has fever and is lethargic",
        symptom_tokens=["high_fever", "lethargy", "child"],
        k=3,
    )
    sources = {s.source for s in snippets}
    assert any("IMCI" in src for src in sources)


def test_retrieve_returns_mental_health_for_suicidal_ideation():
    snippets = retrieve(
        "I don't want to live anymore",
        symptom_tokens=["suicidal_ideation"],
        k=3,
    )
    assert any(s.id == "mental_health_who" or s.id == "mh_helplines_india" for s in snippets)


def test_to_citation_is_serialisable():
    snippets = retrieve("chest pain", symptom_tokens=["chest_pain"], k=1)
    c = snippets[0].to_citation()
    assert {"id", "source", "section", "text"} <= set(c.keys())
