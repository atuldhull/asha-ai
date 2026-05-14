"""
ASHA-AI — LLM Provider abstraction (Plan 3.0)
=============================================

Single point of swap between cloud (Gemini 2.5 Flash) and edge (Ollama +
Gemma 2/3/4 or Llama 3.1). The triage pipeline imports `get_provider()`;
the actual provider is chosen at runtime from the `LLM_PROVIDER` env var.

The unplug demo (Plan 3.0 flagship beat) relies on this abstraction —
pulling ethernet does NOT crash the backend because the Ollama provider
talks to localhost and the safety-property rule layer is independent of
the LLM entirely.

Contract (every provider implements):
  - extract_symptoms(text, language) -> ExtractedSymptoms
  - followup_question(partial, context) -> str
  - name: str          # "gemini" | "ollama"
  - version: str       # e.g. "2.5-flash" | "gemma2:9b"
  - is_offline: bool   # True for Ollama; gates which UI labels show
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


# ── Data shape returned by every provider ──────────────────────────────
@dataclass
class ExtractedSymptom:
    name: str                       # snake_case, drawn from the 50-symptom vocab
    severity: str | None = None     # "mild" | "moderate" | "severe"
    duration_hours: float | None = None
    modifiers: list[str] = field(default_factory=list)


@dataclass
class ExtractedSymptoms:
    symptoms: list[ExtractedSymptom]
    history_hints: list[str] = field(default_factory=list)
    age: int | None = None
    needs_followup: bool = False
    followup_question: str = ""
    language_detected: str | None = None
    provider: str = ""              # filled by get_provider() wrapper
    raw: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "ExtractedSymptoms":
        symptoms = [
            ExtractedSymptom(
                name=s["name"],
                severity=s.get("severity"),
                duration_hours=s.get("duration_hours"),
                modifiers=list(s.get("modifiers") or []),
            )
            for s in (d.get("symptoms") or [])
        ]
        return cls(
            symptoms=symptoms,
            history_hints=list(d.get("history_hints") or []),
            age=d.get("age"),
            needs_followup=bool(d.get("needs_followup", False)),
            followup_question=str(d.get("followup_question") or ""),
            language_detected=d.get("language_detected"),
            provider=str(d.get("provider") or d.get("_provider") or ""),
            raw=d,
        )


# ── Provider Protocol ──────────────────────────────────────────────────
@runtime_checkable
class LLMProvider(Protocol):
    name: str
    version: str
    is_offline: bool

    async def extract_symptoms(
        self, text: str, language: str = "en"
    ) -> ExtractedSymptoms:
        ...

    async def followup_question(
        self, partial: ExtractedSymptoms, context: dict[str, Any]
    ) -> str:
        ...


# ── Factory ────────────────────────────────────────────────────────────
_PROVIDER_SINGLETON: LLMProvider | None = None


def get_provider(force: str | None = None) -> LLMProvider:
    """Return the configured LLM provider.

    Selection order:
      1. `force` argument (explicit override; used by tests + edge demo)
      2. `LLM_PROVIDER` env var ("gemini" | "ollama")
      3. Falls back to "gemini" if GEMINI_API_KEY is set, else "ollama"

    The chosen provider is cached for the process lifetime. Call
    `reset_provider()` to clear in tests.
    """
    global _PROVIDER_SINGLETON
    if _PROVIDER_SINGLETON is not None and force is None:
        return _PROVIDER_SINGLETON

    mode = (force or os.getenv("LLM_PROVIDER", "")).strip().lower()
    if not mode:
        mode = "gemini" if os.getenv("GEMINI_API_KEY") else "ollama"

    if mode == "ollama":
        from app.llm.ollama import OllamaProvider
        provider: LLMProvider = OllamaProvider()
    elif mode == "gemini":
        from app.llm.gemini import GeminiProvider
        provider = GeminiProvider()
    else:
        raise ValueError(
            f"Unknown LLM_PROVIDER={mode!r}; expected 'gemini' or 'ollama'"
        )

    _PROVIDER_SINGLETON = provider
    return provider


def reset_provider() -> None:
    """Clear the cached provider — only used by tests + manual swaps."""
    global _PROVIDER_SINGLETON
    _PROVIDER_SINGLETON = None
