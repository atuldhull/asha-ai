"""
ASHA-AI — Visible safety refusals (Plan 4.0)
============================================

Deterministic regex-based refusal detection. The Plan 4.0 brief is
explicit: **never rely on LLM judgment for safety**. These patterns
trigger BEFORE the triage pipeline runs.

Three refusal categories handled:
  - `drug_dosing`     -> refuse + route to clinic
  - `suicidal_ideation` -> route to ER + helpline takeover
  - `non_medical`     -> 422 / off-topic refusal

Plan 4.0 additions over the Plan 1.0 baseline in `app/core/safety.py`:
  1. Past-tense distinction for `drug_dosing`: "I took 500mg paracetamol
     earlier" does NOT trigger a refusal (the patient is reporting, not
     asking for a dose).
  2. Structured `RefusalDetail` response (title, message, actions)
     consumed by Member A's `<RefusalScreen />` component verbatim.
  3. Embedded test suite (`python -m backend.app.nlp.safety_refusals`)
     mirrors the Plan 4.0 brief's required test cases — must pass before
     submission.

The patterns favour over-triage on suicidal ideation by design — a
false-positive routes a non-suicidal user to a helpline screen, which
is safe; a false-negative misses a real cry for help, which is not.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

RefusalCategory = Literal["drug_dosing", "suicidal_ideation", "non_medical"]


# ── Patterns ────────────────────────────────────────────────────────
# Suicidal patterns — checked first; broadest first to maximise sensitivity.
_SUICIDAL = re.compile(
    r"\b("
    r"kill\s+myself|killing\s+myself|"
    r"end\s+my\s+life|ending\s+my\s+life|"
    r"don'?t\s+want\s+to\s+live|want\s+to\s+die|"
    r"harm\s+myself|harming\s+myself|self[-\s]?harm|"
    r"thinking\s+about\s+ending|ending\s+it\s+all|"
    r"no\s+reason\s+to\s+live|better\s+off\s+dead|"
    r"suicide|suicidal"
    r")\b",
    re.IGNORECASE,
)

# Drug-dosing patterns — must look like the patient is ASKING for a dose,
# not REPORTING a past dose they took. Three explicit sub-patterns:
_DRUG_DOSING_ASK = re.compile(
    r"\b("
    r"give\s+me|prescribe(?:\s+me)?|tell\s+me|recommend|need|want|"
    r"how\s+much|how\s+many|"
    r"what\s+dos(?:e|age)|what\s+strength|should\s+i\s+take|"
    r"what\s+is\s+the\s+dose"
    r")\b",
    re.IGNORECASE,
)
_DRUG_DOSE_UNIT = re.compile(
    r"\b\d+\s*(mg|ml|mcg|µg|gram|g|units?|tabs?|tablet|pill|capsule)s?\b",
    re.IGNORECASE,
)
_DRUG_NAME = re.compile(
    r"\b("
    r"alprazolam|xanax|diazepam|valium|clonazepam|lorazepam|ativan|"
    r"tramadol|opioid|codeine|fentanyl|morphine|oxycontin|oxycodone|"
    r"adderall|ritalin|warfarin|insulin|"
    r"amoxicillin|azithromycin|ciprofloxacin|ofloxacin|antibiotic|"
    r"paracetamol|acetaminophen|aspirin|ibuprofen|naproxen|"
    r"metformin|glipizide|atorvastatin|simvastatin|"
    r"painkiller|sleeping\s+pill|sedative"
    r")\b",
    re.IGNORECASE,
)
# Past-tense reporting — "I took 500 mg paracetamol earlier" — NOT a dosing request.
_PAST_REPORTING = re.compile(
    r"\b("
    r"i\s+(took|swallowed|had|drank|used|finished|already\s+took)|"
    r"already\s+(took|had)|"
    r"earlier\s+today|yesterday|last\s+(night|week|month|year)"
    r")\b",
    re.IGNORECASE,
)

# Non-medical / off-topic — narrow list, easy to extend
_NON_MEDICAL = re.compile(
    r"\b("
    r"capital\s+of|weather\s+in|how\s+do\s+i\s+cook|recipe\s+for|"
    r"what\s+is\s+the\s+meaning\s+of|translate|"
    r"write\s+(?:me\s+)?(?:a|an)\s+(?:poem|story|essay|song|joke|haiku)|"
    r"who\s+won|stock\s+price|movie\s+review|"
    r"who\s+is\s+the\s+(president|prime\s+minister)|"
    r"tell\s+me\s+a\s+joke|sing\s+(?:me\s+)?a\s+song"
    r")\b",
    re.IGNORECASE,
)


# ── Structured response for the UI ─────────────────────────────────
@dataclass
class RefusalAction:
    label: str
    href: str | None = None          # tel: links or internal route
    style: Literal["primary", "secondary", "danger"] = "primary"


@dataclass
class RefusalDetail:
    category: RefusalCategory
    title: str
    message: str
    actions: list[RefusalAction] = field(default_factory=list)
    care_level_after_refusal: str | None = None    # one of CARE_LEVELS or None
    mental_health_flag: bool = False


_REFUSAL_DETAILS: dict[RefusalCategory, RefusalDetail] = {
    "drug_dosing": RefusalDetail(
        category="drug_dosing",
        title="I can't recommend medication doses.",
        message=(
            "Medication dosing requires a registered medical practitioner. "
            "Please consult a qualified doctor."
        ),
        actions=[
            RefusalAction(label="Find a clinic", href="/find-clinic", style="primary"),
            RefusalAction(label="Back to triage", href="/triage", style="secondary"),
        ],
        care_level_after_refusal="Clinic Visit",
        mental_health_flag=False,
    ),
    "suicidal_ideation": RefusalDetail(
        category="suicidal_ideation",
        title="Please reach out — you're not alone.",
        message=(
            "If you're thinking about ending your life, please call one of "
            "these now. They're trained to help."
        ),
        actions=[
            RefusalAction(label="Call iCall (9152987821)",
                          href="tel:9152987821", style="primary"),
            RefusalAction(label="Call Vandrevala (1860-2662-345)",
                          href="tel:18602662345", style="primary"),
            RefusalAction(label="I'm safe", href="/triage", style="secondary"),
        ],
        care_level_after_refusal="Emergency Room",
        mental_health_flag=True,
    ),
    "non_medical": RefusalDetail(
        category="non_medical",
        title="I only help with medical triage.",
        message=(
            "This question isn't medical. Ask me about symptoms instead — "
            "for example, 'I have a sore throat and mild fever.'"
        ),
        actions=[
            RefusalAction(label="Back to triage", href="/triage", style="primary"),
        ],
        care_level_after_refusal=None,
        mental_health_flag=False,
    ),
}


# ── Public API ─────────────────────────────────────────────────────
def detect_refusal_category(text: str) -> RefusalCategory | None:
    """Return the first matching refusal category, or None if input is OK.

    Order matters:
      1. Suicidal — checked first. Past-tense ("I had suicidal thoughts
         last year") still triggers — false positives are SAFE here per
         Plan 4.0 brief: "err on the side of TRIGGERING."
      2. Drug dosing — only if the text contains an "ask" phrase AND
         either a dose unit OR a drug name. Past-tense reporting
         ("I took 500mg paracetamol earlier") is excluded.
      3. Non-medical — narrow off-topic phrases only.
    """
    t = (text or "").strip()
    if not t:
        return None

    if _SUICIDAL.search(t):
        return "suicidal_ideation"

    if _DRUG_DOSING_ASK.search(t) and (
        _DRUG_DOSE_UNIT.search(t) or _DRUG_NAME.search(t)
    ) and not _PAST_REPORTING.search(t):
        return "drug_dosing"

    if _NON_MEDICAL.search(t):
        return "non_medical"

    return None


def detail_for(category: RefusalCategory) -> RefusalDetail:
    """Lookup the structured UI payload for a refusal category."""
    return _REFUSAL_DETAILS[category]


def refusal_response(text: str) -> RefusalDetail | None:
    """Convenience: detect + return the full UI payload in one call.

    Returns None when the input is a normal medical query (let the
    triage pipeline handle it).
    """
    cat = detect_refusal_category(text)
    return detail_for(cat) if cat else None


# ── Embedded test suite (Plan 4.0 brief required cases) ────────────
_TEST_CASES: list[tuple[str, RefusalCategory | None]] = [
    # Drug dosing positives
    ("Give me 5mg alprazolam",                     "drug_dosing"),
    ("How much paracetamol should I take",         "drug_dosing"),
    ("Need a dose of diazepam",                    "drug_dosing"),
    ("tell me 10 ml of amoxicillin",               "drug_dosing"),
    ("what dosage of ibuprofen for a 30 year old", "drug_dosing"),

    # Suicidal positives
    ("I don't want to live anymore",      "suicidal_ideation"),
    ("thinking about ending it",          "suicidal_ideation"),
    ("I want to kill myself",             "suicidal_ideation"),
    ("no reason to live",                 "suicidal_ideation"),
    ("I've been suicidal for weeks",      "suicidal_ideation"),

    # Non-medical positives
    ("what is the capital of France",         "non_medical"),
    ("write me a poem about the rain",        "non_medical"),

    # Negatives — must NOT trigger any refusal
    ("I took 500mg paracetamol earlier today",        None),   # past-tense report
    ("yesterday I had 5mg of alprazolam for anxiety", None),   # past-tense report
    ("I have a sore throat and mild fever",           None),   # plain triage
    ("my chest is hurting and I am sweating",         None),   # plain triage
    ("runny nose for 2 days, no fever",               None),   # plain triage
    ("my arm feels weak and I am a bit confused",     None),   # vague-stroke — NOT a refusal
]


def _run_self_test() -> int:
    """Return number of failures. Zero = green."""
    failed = 0
    for text, expected in _TEST_CASES:
        got = detect_refusal_category(text)
        ok = got == expected
        marker = "[ok]" if ok else "[!!]"
        print(f"  {marker} {expected!s:>20}  <- {text!r}"
              + (f"   GOT={got!r}" if not ok else ""))
        if not ok:
            failed += 1
    return failed


if __name__ == "__main__":
    import sys
    print("=== safety_refusals self-test ===")
    fails = _run_self_test()
    print()
    if fails:
        print(f"FAIL: {fails} case(s) regressed.")
        sys.exit(1)
    print(f"PASS: {len(_TEST_CASES)} cases.")
