# Agentic Tool-Use Architecture

> **Owner:** Member C designs · Member B integrates · Required for Plan 4.0. Companion to [RED_FLAGS.md](RED_FLAGS.md), [EVAL_SPEC.md](EVAL_SPEC.md), [METHODOLOGY.md](METHODOLOGY.md).

## Why this exists

The phrase **"the LLM is one of five components, not the decider"** is our entire technical-credibility defense in Q&A. This document defines those 5 deterministic tools that the LLM is forced to call via Gemini function calling. The LLM **orchestrates**; the tools **decide**.

This is what lets us say in the pitch:

> *"We don't prompt the LLM, the LLM calls our deterministic clinical tools — extract_symptoms, get_red_flags, compute_esi, imci_lookup, rag_retrieve. The deterministic tools own the safety properties."*

## The 5 tools (locked schemas)

### Tool 1 · `extract_symptoms`

Parses free-text patient input into structured symptoms with severity, duration, modifiers.

```json
{
  "name": "extract_symptoms",
  "description": "Parse free-text patient input into structured symptoms with severity, duration, and modifiers. Detects vague-presentation patterns (e.g. stroke FAST hidden in 'arm heavy + confused').",
  "parameters": {
    "type": "object",
    "properties": {
      "patient_text": {"type": "string"},
      "language": {"type": "string", "enum": ["en", "hi", "kn"]}
    },
    "required": ["patient_text"]
  }
}
```

**Returns:**
```json
{
  "symptoms": [
    {
      "name": "string (snake_case)",
      "severity": "mild|moderate|severe",
      "duration_hours": "number | null",
      "modifiers": ["string"]
    }
  ],
  "needs_followup": "boolean",
  "followup_hint": "string | null",
  "confidence": "0..1"
}
```

### Tool 2 · `get_red_flags`

Applies the 9 deterministic clinical red-flag rules. **The safety net.**

```json
{
  "name": "get_red_flags",
  "description": "Apply the 9 deterministic clinical red-flag rules. Returns flags that, if present, force Emergency Room triage. Can only escalate, never downgrade.",
  "parameters": {
    "type": "object",
    "properties": {
      "symptoms": {"type": "array"},
      "age": {"type": "integer"},
      "sex": {"type": "string", "enum": ["M", "F", "other"]},
      "history": {"type": "array", "items": {"type": "string"}},
      "vitals": {
        "type": "object",
        "properties": {
          "hr": {"type": "number"},
          "rr": {"type": "number"},
          "spo2": {"type": "number"},
          "bp_sys": {"type": "number"},
          "bp_dia": {"type": "number"},
          "temp_c": {"type": "number"}
        }
      }
    },
    "required": ["symptoms", "age"]
  }
}
```

**Returns:**
```json
{
  "flags": [
    {
      "rule_id": "string (e.g. R2_STROKE_FAST)",
      "rule_name": "string",
      "force_level": "Emergency Room",
      "reasoning": "string"
    }
  ],
  "force_escalation": "boolean"
}
```

### Tool 3 · `compute_esi`

Maps symptoms + vitals to Emergency Severity Index v5.

```json
{
  "name": "compute_esi",
  "description": "Map symptoms + vitals to Emergency Severity Index v5 level (1=immediate, 5=non-urgent). Returns a care_level mapping to one of: Home Care / Clinic Visit / Emergency Room.",
  "parameters": {
    "type": "object",
    "properties": {
      "symptoms": {"type": "array"},
      "vitals": {"type": "object"},
      "age": {"type": "integer"}
    },
    "required": ["symptoms", "age"]
  }
}
```

**Returns:**
```json
{
  "esi_level": "1|2|3|4|5",
  "care_level": "Home Care|Clinic Visit|Emergency Room",
  "reasoning": "string"
}
```

**ESI → care-level mapping:**
- ESI 1 or 2 → `Emergency Room`
- ESI 3 → `Clinic Visit` (urgent)
- ESI 4 or 5 → `Home Care` or `Clinic Visit` based on age + comorbidities

### Tool 4 · `imci_lookup`

WHO IMCI protocol lookup for children under 5.

```json
{
  "name": "imci_lookup",
  "description": "WHO Integrated Management of Childhood Illness lookup for children under 5. Returns IMCI danger signs and care recommendation.",
  "parameters": {
    "type": "object",
    "properties": {
      "age_months": {"type": "integer"},
      "symptoms": {"type": "array"},
      "vitals": {"type": "object"}
    },
    "required": ["age_months", "symptoms"]
  }
}
```

**Returns:**
```json
{
  "danger_signs": ["string"],
  "imci_classification": "string",
  "recommendation": "Home Care|Clinic Visit|Emergency Room",
  "citation": "WHO IMCI Chart Booklet §X.Y"
}
```

### Tool 5 · `rag_retrieve`

Retrieves guideline snippets from WHO IMCI / India MoHFW STG corpus.

```json
{
  "name": "rag_retrieve",
  "description": "Retrieve top-K guideline snippets to ground the verdict explanation with citations.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {"type": "string"},
      "k": {"type": "integer", "default": 3}
    },
    "required": ["query"]
  }
}
```

**Returns:**
```json
{
  "snippets": [
    {
      "text": "string",
      "source": "string (e.g. 'WHO IMCI Chart Booklet')",
      "section": "string (e.g. '§3.1')",
      "score": "0..1"
    }
  ]
}
```

## Orchestration loop (locked sequence)

The LLM is given access to all 5 tools and a system prompt that constrains it to this sequence:

```
1. extract_symptoms(patient_text)
   → structured symptoms + needs_followup flag
   → if needs_followup, ask ONE follow-up question and loop back

2. get_red_flags(symptoms, age, sex, history, vitals)
   → if force_escalation: skip to step 5 with care_level = "Emergency Room"

3. compute_esi(symptoms, vitals, age)
   → ESI level + care_level

4. If age < 5: imci_lookup(age_months, symptoms, vitals)
   → IMCI recommendation

5. rag_retrieve(symptom summary)
   → top-3 citation snippets

6. Compose verdict:
     final_care_level = max(
       red_flags.force_level,
       esi.care_level,
       imci.recommendation
     )
     where Emergency Room > Clinic Visit > Home Care
   Return verdict object with reasoning + citations
```

## The Safety Property (unit-tested)

```python
# In every code path:
assert final_care_level == max(
    red_flags.force_level or "Home Care",
    esi.care_level,
    imci.recommendation or "Home Care"
)

# Tools can only ESCALATE, never DOWNGRADE.
```

This property is the line that wins Q&A. **Type "severe chest pain" → ER**, no matter what the LLM was instructed.

## System prompt skeleton (Member C drafts the full version)

```
You are ASHA-AI, a triage assistant. You DO NOT diagnose or
prescribe — per India Telemedicine Practice Guidelines 2020,
your role is decision support for a registered medical practitioner.

You have access to 5 tools. You MUST call them in this order:
  1. extract_symptoms(patient_text, language)
  2. If `needs_followup` is true, ask ONE specific follow-up question.
     Loop back to step 1 with the new info.
  3. get_red_flags(...)
  4. If force_escalation is true, skip to step 7.
  5. compute_esi(...)
  6. If patient age < 5, also call imci_lookup(...)
  7. rag_retrieve(...) to ground your final verdict in guidelines.
  8. Compose the verdict using the orchestration rule:
     final_care_level = max(red_flags.force_level, esi.care_level, imci.recommendation)

You MUST NOT:
  - Provide medication dosing
  - Diagnose specific diseases
  - Recommend prescription drugs
  - Use the words "I diagnose" or "you have [disease]"

When you encounter:
  - Drug dosing request → refuse + suggest consulting a doctor
  - Suicidal ideation → return Emergency Room + show iCall (9152987821) and Vandrevala (1860-2662-345)
  - Non-medical query → politely refuse

Always include the disclaimer:
  "Not a replacement for professional medical diagnosis."
```

## Q&A defense

> "Isn't this just a GPT wrapper?"
>
> "No. Gemini is the orchestrator. The decision is made by 5 deterministic tools we wrote — extract_symptoms, get_red_flags, compute_esi, imci_lookup, rag_retrieve. The LLM is forced via function calling to invoke them in a fixed sequence. The rule layer is unit-tested to enforce escalate-only — meaning the LLM cannot downgrade an emergency to home care, ever."
