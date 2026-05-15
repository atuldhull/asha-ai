"""
ASHA-AI — Post-extraction safety + adversarial post-processor (Plan 4.0)
========================================================================

Runs AFTER any `LLMProvider.extract_symptoms()` returns. Two jobs:

  1. **Adversarial vague-stroke catch.** The Plan 4.0 brief's flagship
     demo beat: patient says "my left arm feels heavy and I'm a bit
     confused" -> system must ask the FAST screen as the next message,
     regardless of what the LLM decided. Deterministic, regex-driven,
     never relies on LLM judgment.

  2. **Suicidal-ideation fast-path.** Same logic as the safety-refusal
     layer, but applied to the extracted symptom set as a backstop. If
     the LLM somehow extracted suicidal cues but did NOT set
     needs_followup -> we force it.

The two false-positive guards documented in the Plan 4.0 brief are
enforced via regex precision:
  - "my arm is sore from the gym" -> "sore" not in heavy/weak/numb list,
    no confusion term -> no trigger
  - "I have a heavy backpack and my shoulder hurts" -> no body part in
    arm/leg/hand/face/side, no confusion -> no trigger
  - "I'm a bit confused about my insurance" -> no body part -> no trigger

These cases are baked into the embedded self-test below.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.llm.base import ExtractedSymptoms

# ── Vague stroke pattern (per Plan 4.0 brief + ADVERSARIAL_DEMO.md) ──
# Requires ALL THREE:
#   (a) a body-part token in the unilateral-weakness vocabulary
#   (b) a weakness/numbness sensory token (NOT generic "sore" / "hurt")
#   (c) a confusion/dizziness/dazed-ness token
#
# All three must appear in the same sentence-ish window. Order doesn't
# matter (.* in between).
_VAGUE_STROKE = re.compile(
    r"""(?ix)
    \b (?: arm | leg | hand | face | side ) \b      # (a) body part
    .{0,80}?
    \b (?:
          heavy | weak | numb | strange | funny | droop
        | tingl \w*                                  # tingle / tingling / tingles
        | feels \s+ off
       )                                             # (b) sensory
    .{0,80}?
    \b (?:
          dizzy | weird | fuzzy | spinning | disoriented
        | confus \w*                                 # confused / confusion / confusing
        | daz \w*                                    # dazed / dazing
        | off \s+ balance
       )                                             # (c) cognitive
    """
)

# Cognitive cue first, then body-part + sensory.
_VAGUE_STROKE_REVERSE = re.compile(
    r"""(?ix)
    \b (?:
          dizzy | weird | fuzzy | spinning | disoriented
        | confus \w*
        | daz \w*
       )
    .{0,80}?
    \b (?: arm | leg | hand | face | side ) \b
    .{0,80}?
    \b (?:
          heavy | weak | numb | strange | funny | droop
        | tingl \w*
        | feels \s+ off
       )
    """
)


# The hardcoded fallback FAST question — used when the LLM didn't
# supply a follow-up of its own. Lifted verbatim from ADVERSARIAL_DEMO.md.
HARDCODED_FAST_QUESTION = (
    "I want to check a few specific things -- when did this start, "
    "and is one side of your face drooping or numb at all? And how "
    "is your speech feeling right now?"
)


# ── Suicidal-ideation catch (backstop) ──────────────────────────────
# Mirrors safety_refusals._SUICIDAL but checked HERE too in case the
# refusal layer was bypassed (e.g. the input came via voice and the
# refusal check fired on the source-language transcript only).
_SUICIDAL_BACKSTOP = re.compile(
    r"(?i)\b("
    r"kill\s+myself|end\s+my\s+life|"
    r"don'?t\s+want\s+to\s+live|want\s+to\s+die|"
    r"thinking\s+about\s+ending|"
    r"suicide|suicidal"
    r")\b"
)


# ── Public API ─────────────────────────────────────────────────────
@dataclass
class PostProcessTrace:
    """What the post-processor did, for audit + Q&A defensibility."""
    vague_stroke_matched: bool = False
    forced_fast_followup: bool = False
    suicidal_backstop_matched: bool = False


def post_process(
    extracted: ExtractedSymptoms,
    raw_text: str,
) -> tuple[ExtractedSymptoms, PostProcessTrace]:
    """Mutate `extracted` in place and return (extracted, trace).

    Trace is non-empty whenever post-processing changed the extraction
    output — it goes into the audit log so the agentic refactor can
    show "rule X fired" in the Q&A panel.
    """
    trace = PostProcessTrace()
    text = raw_text or ""

    # --- Vague-stroke catch ---
    if _VAGUE_STROKE.search(text) or _VAGUE_STROKE_REVERSE.search(text):
        trace.vague_stroke_matched = True
        # Only force a follow-up if the LLM didn't already ask one
        if not (extracted.needs_followup and extracted.followup_question.strip()):
            extracted.needs_followup = True
            extracted.followup_question = HARDCODED_FAST_QUESTION
            trace.forced_fast_followup = True
        # Also add the FAST cues to the symptom set so the downstream
        # rule engine doesn't miss them
        seen = {s.name for s in extracted.symptoms}
        # Choose the right body-part canonical symptom
        body_match = re.search(r"(?i)\b(arm|hand)\b", text)
        if body_match and "arm_weakness" not in seen:
            from app.llm.base import ExtractedSymptom
            extracted.symptoms.append(
                ExtractedSymptom(name="arm_weakness", severity="moderate"))
            seen.add("arm_weakness")
        if "sudden_confusion" not in seen:
            from app.llm.base import ExtractedSymptom
            extracted.symptoms.append(
                ExtractedSymptom(name="sudden_confusion", severity="moderate"))

    # --- Suicidal backstop ---
    if _SUICIDAL_BACKSTOP.search(text):
        trace.suicidal_backstop_matched = True
        seen = {s.name for s in extracted.symptoms}
        if "suicidal_ideation" not in seen:
            from app.llm.base import ExtractedSymptom
            extracted.symptoms.append(
                ExtractedSymptom(name="suicidal_ideation", severity="severe"))

    return extracted, trace


# ── Embedded self-test ──────────────────────────────────────────────
_VAGUE_STROKE_POSITIVES = [
    "my left arm feels heavy and I'm a bit confused",
    "I'm a bit confused since this morning and my left arm feels weak",
    "right side feels numb and I'm dizzy",
    "my hand has felt strange all morning and I'm fuzzy",
    "left arm feels weak, speech feels off, I'm disoriented",
]

# Brief-required false-positive guards. NONE of these should match.
_VAGUE_STROKE_NEGATIVES = [
    "My arm is sore from yesterday's gym workout",
    "I have a heavy backpack and my shoulder hurts",
    "I'm a bit confused about my insurance",
    "my arm is weak today after lifting weights",      # no confusion
    "I feel dizzy when I stand up too fast",            # no body-part weakness
    "my face feels normal but I'm tired",               # no weakness
]


def _self_test() -> int:
    failed = 0
    print("=== Plan 4.0 adversarial post-processor self-test ===\n")

    print("Vague-stroke POSITIVES (must match):")
    for text in _VAGUE_STROKE_POSITIVES:
        hit = bool(_VAGUE_STROKE.search(text) or _VAGUE_STROKE_REVERSE.search(text))
        m = "[ok]" if hit else "[!!]"
        print(f"  {m} {hit}  <- {text!r}")
        if not hit:
            failed += 1

    print("\nVague-stroke NEGATIVES (must NOT match):")
    for text in _VAGUE_STROKE_NEGATIVES:
        hit = bool(_VAGUE_STROKE.search(text) or _VAGUE_STROKE_REVERSE.search(text))
        m = "[ok]" if not hit else "[!!]"
        print(f"  {m} {hit}  <- {text!r}")
        if hit:
            failed += 1

    return failed


if __name__ == "__main__":
    import sys
    fails = _self_test()
    print()
    if fails:
        print(f"FAIL: {fails} case(s) regressed.")
        sys.exit(1)
    print(f"PASS: {len(_VAGUE_STROKE_POSITIVES) + len(_VAGUE_STROKE_NEGATIVES)} cases.")
