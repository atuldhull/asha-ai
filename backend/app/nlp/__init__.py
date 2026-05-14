"""ASHA-AI NLP layer (Plan 3.0).

- `bhashini` — pipelined ASR + NMT + TTS for Hindi/Kannada/English voice.
- `rag` — BGE-M3 embedder + pgvector retriever for citation-grounded
  triage responses.

Both modules degrade gracefully when their backing service is
unconfigured/unreachable — pulling the ethernet during the Plan 3.0
unplug demo must NOT 500 the backend.
"""
