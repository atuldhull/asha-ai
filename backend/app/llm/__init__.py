"""LLM providers (Plan 3.0): swappable via `LLM_PROVIDER` env var.

Default: Gemini 2.5 Flash (cloud). Edge: Ollama + Gemma 2/3/4.
The provider abstraction lives in [base.py](base.py).
"""
from app.llm.base import (
    ExtractedSymptom,
    ExtractedSymptoms,
    LLMProvider,
    get_provider,
    reset_provider,
)

__all__ = [
    "ExtractedSymptom",
    "ExtractedSymptoms",
    "LLMProvider",
    "get_provider",
    "reset_provider",
]
