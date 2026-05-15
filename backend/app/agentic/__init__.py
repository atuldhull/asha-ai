"""ASHA-AI agentic layer (Plan 4.0).

The line that wins Q&A:

  "We don't prompt the LLM. The LLM is forced via function-calling to
   invoke 5 deterministic tools — extract_symptoms, get_red_flags,
   compute_esi, imci_lookup, rag_retrieve — in a fixed order. The
   rule layer is unit-tested to enforce escalate-only."

Spec: docs/AGENTIC_TOOLS.md.

Modules:
- `tools` — 5 deterministic tool implementations (pure adapters over
  existing Plan 2.0/3.0 modules)
- `orchestrator` — two implementations:
    * `orchestrate_via_gemini`: real Gemini function-calling
    * `orchestrate_synthetic`: deterministic fallback that runs the
      same 5 tools in the canonical sequence without an LLM
  Both return a Verdict shape compatible with the existing /triage
  response so the API contract doesn't change.
"""
