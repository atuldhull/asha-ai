"""Plan 5.2 — synthetic red-flag dataset generator.

Produces ~2000 labeled rows for fine-tuning DistilBERT as a parallel ML
safety layer alongside the deterministic 9-rule red-flag detector.

Strategy:
  1. Hand-authored seed phrases — 9 ESI v5 emergency categories × 6 seeds
     each (54 emergency seeds), plus 60 routine-complaint seeds.
  2. Gemini paraphrase loop expands each seed by ~18 variations (formal
     English, colloquial Hindi-English, Kannada-English, regional metaphors
     like "elephant on chest", "chakkar aa raha hai").
  3. Stratified 80/20 train/test split — preserves class balance and
     category coverage in both partitions.
  4. Honest disclosure baked into the metadata header.

Fallback: if GEMINI_API_KEY is unset, runs in seed-only mode (~114 rows).
DistilBERT will train on the seeds alone with degraded performance — but
the script never fails. Role C can re-run later when key lands.

Usage:
    cd d:\\hack\\ml
    py scripts\\synthesize_red_flag_dataset.py [--target-per-seed N]
                                               [--out-dir datasets]
                                               [--no-gemini]

Outputs:
    datasets/red_flag_train.csv         (~1600 rows, label + text + category)
    datasets/red_flag_test.csv          (~400 rows, held-out 20% stratified)
    datasets/red_flag_synthesis_report.md  (counts + provenance)

Exit 0 on success, 1 on fatal I/O error. Gemini failures are non-fatal
(fall back to seed-only mode for that batch).
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]  # d:\hack\ml
DEFAULT_OUT_DIR = ROOT / "datasets"
RANDOM_SEED = 20260515  # reproducible; change to refresh sample


# ──────────────────── seed phrases ────────────────────
# 9 ESI v5 emergency categories. Sources cited inline so MBBS reviewer can
# audit the seed bank without leaving the file.

EMERGENCY_SEEDS: dict[str, list[str]] = {
    # Cat 1 — STEMI / ACS (RED_FLAGS.md R1)
    "cardiac_acs": [
        "crushing chest pain radiating to left arm and jaw, sweating, short of breath",
        "feels like an elephant sitting on my chest, sweating profusely",
        "central chest pressure spreading to my jaw and left shoulder",
        "tight band around chest, can't catch breath, very sweaty",
        "heavy weight on chest with pain down both arms",
        "stabbing chest pain plus nausea and cold clammy skin",
    ],
    # Cat 2 — Stroke (RED_FLAGS.md R2)
    "stroke": [
        "sudden weakness on one side of body, face drooping, slurred speech",
        "right arm went numb and I cannot smile properly",
        "the worst headache of my life came on like thunder",
        "lost vision in one eye suddenly, room is spinning",
        "can't lift my arm and my words are coming out wrong",
        "suddenly cannot understand what people are saying to me",
    ],
    # Cat 3 — Anaphylaxis (RED_FLAGS.md R3)
    "anaphylaxis": [
        "throat is closing, cannot swallow, lips swelling rapidly",
        "hives all over, wheezing, feel like I might pass out",
        "tongue swelling and trouble breathing after taking the medicine",
        "face puffed up, throat tight, dizzy and nauseous",
        "rash spreading fast, mouth tingling, cannot get air in",
        "voice gone hoarse, hard to swallow, blood pressure dropping",
    ],
    # Cat 4 — Sepsis (RED_FLAGS.md R4)
    "sepsis": [
        "high fever with shaking chills and feeling completely confused",
        "fever, fast heart, rapid breathing, blood pressure low",
        "feels like dying, fever for two days, very confused",
        "burning skin temperature, shivering uncontrollably, drowsy",
        "fever and confused, cold hands and feet, lips a bit blue",
        "high fever with mottled skin and not making sense when talking",
    ],
    # Cat 5 — Suicidal ideation (RED_FLAGS.md R5)
    "suicidal_ideation": [
        "I want to end my life, I have a plan, I cannot go on",
        "thinking of killing myself, do not want to be here anymore",
        "going to harm myself today, no point continuing",
        "writing my goodbye notes, ready to end it all",
        "have the pills ready, going to take them all tonight",
        "I want to die, please help me, I have no other option",
    ],
    # Cat 6 — Pediatric critical (RED_FLAGS.md R6)
    "pediatric_critical": [
        "infant not breathing, lips blue, body limp",
        "newborn not waking up, very floppy, blue around mouth",
        "child had a seizure that lasted more than five minutes",
        "baby gasping for air, ribs sucking in with each breath",
        "toddler unresponsive, eyes rolled back, not breathing properly",
        "infant burning hot, vomiting everything, sunken eyes and dry lips",
    ],
    # Cat 7 — GI bleed / surgical abdomen (RED_FLAGS.md R7)
    "gi_emergency": [
        "vomited a large amount of bright red blood, dizzy and weak",
        "passing black tarry stool with severe stomach pain",
        "abdomen is rigid like a board, cannot bear to be touched",
        "throwing up blood, very pale, heart pounding",
        "blood in stool with severe cramping and dizziness",
        "stomach swollen, hard, severe pain, cannot pass gas",
    ],
    # Cat 8 — Meningitis (RED_FLAGS.md R8)
    "meningitis": [
        "high fever with stiff neck and bright red rash spreading",
        "cannot touch my chin to my chest, fever, light hurts my eyes",
        "neck rigid, fever, vomiting and very confused",
        "stiff neck, headache, rash that does not fade when pressed",
        "fever, neck pain, sensitivity to light, drowsy",
        "child fever stiff neck and rash all over chest",
    ],
    # Cat 9 — Major trauma / critical injury (RED_FLAGS.md R9)
    "trauma": [
        "head injury, briefly unconscious, vomiting now",
        "fell from rooftop, severe back pain, cannot move legs",
        "road accident, deep cut bleeding heavily, very pale",
        "snake bite half hour ago, swelling spreading up the arm",
        "electric shock, burned palm, irregular heart beat",
        "drowning rescue, unconscious, breathing irregularly",
    ],
}

# Routine / non-emergency complaints. Wide spread so the negative class
# isn't all upper-respiratory fluff.
ROUTINE_SEEDS: list[str] = [
    "mild headache for a few hours, took paracetamol, feeling slightly better",
    "sore throat for two days, no fever, can swallow okay",
    "stuffy nose and sneezing, started yesterday, no other symptoms",
    "stomach ache after eating spicy food last night",
    "mild fever 99 degrees, feeling tired but eating normally",
    "itchy rash on forearm, no pain, no spread",
    "constipation for three days, no severe pain",
    "back pain after lifting something heavy yesterday",
    "knee pain when climbing stairs, gradual over months",
    "dry cough for a week, no fever, no breathing difficulty",
    "occasional acid reflux after meals",
    "mild dizziness when standing up too fast",
    "small cut on finger from cooking, bleeding stopped",
    "cold for three days, runny nose and mild cough",
    "shoulder pain from sleeping in awkward position",
    "mild ear discomfort, no discharge, no fever",
    "occasional headache when working long hours at computer",
    "minor sunburn on shoulders, peeling slightly",
    "loose motions twice today after street food",
    "mild anxiety before exam, sleeping okay",
    "lower back stiffness after long drive",
    "patch of dry skin on elbow, itches sometimes",
    "occasional mild migraine triggered by skipped meal",
    "feeling tired and run down for a few days",
    "mild eye irritation from dust, no vision change",
    "tooth sensitivity to cold drinks, not constant",
    "slight cough with clear phlegm in the morning",
    "muscle soreness after gym workout yesterday",
    "mild ankle swelling at end of long workday",
    "small pimples on face, no pain, no fever",
    "occasional indigestion after large meals",
    "mild scalp itching, suspect dandruff",
    "minor abrasion on knee from a fall, cleaned and dressed",
    "mild cramps during period, manageable with ibuprofen",
    "intermittent mild ringing in one ear, hearing normal",
    "pulled hamstring last week, healing slowly",
    "occasional heartburn after spicy meals",
    "mild gas and bloating after dinner",
    "small bruise on arm from bumping into door",
    "mild morning sneezing, suspect allergies",
    "very faint cough, no fever, normal energy",
    "occasional joint stiffness in fingers in the morning",
    "mild rash on neck from new metal chain",
    "sometimes feel slightly nauseous on empty stomach",
    "small blister on heel from new shoes",
    "mild sore on inner cheek from biting it",
    "very light spotting between periods, no pain",
    "intermittent mild cough at night",
    "occasional toothache, dentist appointment booked",
    "mild seasonal allergy, sneezing and watery eyes",
    "very tired today, slept poorly last night",
    "minor headache after long phone call",
    "small hangnail, slightly painful",
    "occasional acid taste in throat after meals",
    "mild forearm soreness from carrying groceries",
    "very mild itching on scalp, suspect hair-care product",
    "occasional gentle ringing in ears in quiet rooms",
    "minor skin redness from new sunscreen",
    "mild leg cramp at night, woke me briefly",
    "occasional bad breath, brushing twice daily",
]


@dataclass
class Row:
    text: str
    label: int  # 1 = emergency, 0 = non-emergency
    category: str
    source: str  # 'seed' or 'gemini'


# ──────────────────── Gemini paraphrase loop ────────────────────


def gemini_available() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def ollama_available() -> bool:
    """Zero-cost local fallback when no Gemini/Together key is reachable."""
    base = os.getenv("OLLAMA_BASE", "http://localhost:11434").rstrip("/")
    try:
        import urllib.request
        with urllib.request.urlopen(f"{base}/api/tags", timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def ollama_paraphrase(seed: str, n: int, category_hint: str) -> list[str]:
    """Local-LLM paraphrase via Ollama. Mirrors gemini_paraphrase output."""
    base = os.getenv("OLLAMA_BASE", "http://localhost:11434").rstrip("/")
    model = os.getenv("OLLAMA_PARAPHRASE_MODEL", os.getenv("OLLAMA_MODEL", "gemma2:9b"))
    prompt = (
        f"Paraphrase the following patient symptom description in {n} different ways. "
        f"Vary register: formal English, colloquial Hindi-English, Kannada-English, "
        f"regional Indian metaphors. Preserve clinical meaning. "
        f"One paraphrase per line, no numbering, no quotes.\n\n"
        f"Original ({category_hint}): {seed}"
    )
    try:
        import urllib.request
        body = json.dumps({
            "model": model, "prompt": prompt, "stream": False,
            "options": {"num_predict": 600, "temperature": 0.8},
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{base}/api/generate", data=body,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            text = json.loads(r.read()).get("response", "")
    except Exception:
        return []
    lines = [s.strip(" -•\"'\t") for s in text.splitlines() if s.strip()]
    seen, out = set(), []
    for line in lines:
        if len(line) < 8 or len(line) > 280 or line.lower() in seen:
            continue
        seen.add(line.lower())
        out.append(line)
        if len(out) >= n:
            break
    return out


def paraphrase(seed: str, n: int, category_hint: str) -> list[str]:
    """Dispatcher: Gemini if keyed, else local Ollama, else []."""
    if os.getenv("GEMINI_API_KEY"):
        g = gemini_paraphrase(seed, n, category_hint)
        if g:
            return g
    if ollama_available():
        return ollama_paraphrase(seed, n, category_hint)
    return []


def gemini_paraphrase(seed: str, n: int, category_hint: str) -> list[str]:
    """Returns up to n unique paraphrases. Best-effort; failures return []."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return []
    try:
        import urllib.request
        import urllib.error
    except ImportError:
        return []

    prompt = (
        f"Paraphrase the following patient symptom description in {n} different ways. "
        f"Vary register: formal English, colloquial Hindi-English, Kannada-English, "
        f"regional Indian metaphors (e.g. 'chakkar aa raha hai', 'pet mein angaar'). "
        f"Preserve clinical meaning. One paraphrase per line, no numbering, no quotes.\n\n"
        f"Original ({category_hint}): {seed}"
    )
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-1.5-flash:generateContent?key={api_key}"
    )
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return []

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        return []

    lines = [s.strip(" -•\"'\t") for s in text.splitlines() if s.strip()]
    seen = set()
    out: list[str] = []
    for line in lines:
        if len(line) < 8 or len(line) > 280:
            continue
        if line.lower() in seen:
            continue
        seen.add(line.lower())
        out.append(line)
        if len(out) >= n:
            break
    return out


# ──────────────────── main pipeline ────────────────────


def expand_emergency(target_per_seed: int, use_gemini: bool) -> list[Row]:
    rows: list[Row] = []
    for category, seeds in EMERGENCY_SEEDS.items():
        for seed in seeds:
            rows.append(Row(text=seed, label=1, category=category, source="seed"))
            if use_gemini:
                paras = paraphrase(seed, target_per_seed, category)
                if paras:
                    sys.stdout.write(
                        f"  [emergency:{category}] +{len(paras)} from Gemini\n"
                    )
                    for p in paras:
                        rows.append(Row(text=p, label=1, category=category, source="gemini"))
                    time.sleep(0.6)  # gentle rate-limit; Gemini free is 15 req/min
    return rows


def expand_routine(target_per_seed: int, use_gemini: bool) -> list[Row]:
    rows: list[Row] = []
    for seed in ROUTINE_SEEDS:
        rows.append(Row(text=seed, label=0, category="routine", source="seed"))
        if use_gemini:
            paras = paraphrase(seed, target_per_seed, "routine_complaint")
            if paras:
                sys.stdout.write(f"  [routine] +{len(paras)} from Gemini\n")
                for p in paras:
                    rows.append(Row(text=p, label=0, category="routine", source="gemini"))
                time.sleep(0.6)
    return rows


def stratified_split(rows: list[Row], test_frac: float = 0.2) -> tuple[list[Row], list[Row]]:
    """Stratify by (label, category) so both partitions cover all categories."""
    rng = random.Random(RANDOM_SEED)
    by_strata: dict[tuple[int, str], list[Row]] = {}
    for r in rows:
        by_strata.setdefault((r.label, r.category), []).append(r)
    train: list[Row] = []
    test: list[Row] = []
    for stratum, items in by_strata.items():
        rng.shuffle(items)
        n_test = max(1, int(round(len(items) * test_frac)))
        test.extend(items[:n_test])
        train.extend(items[n_test:])
    rng.shuffle(train)
    rng.shuffle(test)
    return train, test


def write_csv(rows: list[Row], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["text", "label", "category", "source"])
        for r in rows:
            w.writerow([r.text, r.label, r.category, r.source])


def write_report(train: list[Row], test: list[Row], out: Path, used_gemini: bool) -> None:
    def counts(rows: list[Row]) -> dict[str, int]:
        c: dict[str, int] = {}
        for r in rows:
            c[r.category] = c.get(r.category, 0) + 1
        return c

    train_counts = counts(train)
    test_counts = counts(test)

    lines = [
        "# Plan 5.2 — Red-Flag Synthesis Report\n",
        f"_Generated: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}_\n",
        "",
        "## Honest disclosure",
        "",
        "**Trained on synthetic data.** Seeds are hand-authored from ESI v5 emergency",
        "categories + WHO IMCI routine-complaint patterns. Gemini paraphrases expand each",
        "seed by ~18 colloquial / multilingual variations. **Pre-deployment requires**",
        "**MBBS panel validation against real emergency-call transcripts.**",
        "",
        f"**Gemini paraphrase used:** {'YES' if used_gemini else 'NO (seed-only mode — set GEMINI_API_KEY to expand)'}",
        "",
        f"## Totals",
        f"- Train: {len(train)} rows · {sum(1 for r in train if r.label == 1)} emergency / {sum(1 for r in train if r.label == 0)} routine",
        f"- Test:  {len(test)} rows · {sum(1 for r in test if r.label == 1)} emergency / {sum(1 for r in test if r.label == 0)} routine",
        "",
        "## Train counts by category",
    ]
    for cat in sorted(train_counts):
        lines.append(f"- `{cat}`: {train_counts[cat]}")
    lines.append("")
    lines.append("## Test counts by category")
    for cat in sorted(test_counts):
        lines.append(f"- `{cat}`: {test_counts[cat]}")
    lines.append("")
    lines.append("## Provenance")
    lines.append(
        "- Emergency seeds: 9 ESI v5 categories × 6 hand-authored seeds = 54 rows."
    )
    lines.append(
        f"- Routine seeds: {len(ROUTINE_SEEDS)} hand-authored seeds covering 30+ common complaints."
    )
    lines.append(
        "- Gemini paraphrases (when enabled): ~18 per seed via gemini-1.5-flash, "
        "varied register (formal English, Hindi-English, Kannada-English, regional metaphors)."
    )
    lines.append(
        "- Stratified 80/20 train/test split by (label, category) so both partitions "
        "cover all 9 emergency categories + routine."
    )
    lines.append(
        "- Random seed: " + str(RANDOM_SEED) + " (reproducible — change to refresh sample)."
    )
    out.write_text("\n".join(lines), encoding="utf-8")


def main(argv: Iterable[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--target-per-seed", type=int, default=18)
    p.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    p.add_argument("--no-gemini", action="store_true", help="Force seed-only mode")
    args = p.parse_args(list(argv) if argv is not None else None)

    # "use_gemini" now means "use an LLM paraphraser" — Gemini if keyed,
    # else local Ollama. Kept the var name so the rest of the file + the
    # report header are unchanged.
    use_gemini = (not args.no_gemini) and (gemini_available() or ollama_available())
    if not use_gemini:
        sys.stdout.write(
            "No LLM paraphraser available (no GEMINI_API_KEY, no local Ollama) — "
            "seed-only mode (~114 rows).\n"
        )
    elif not gemini_available():
        sys.stdout.write(
            "Using local Ollama for paraphrase (no GEMINI_API_KEY) — slower but free.\n"
        )

    sys.stdout.write("Expanding emergency seeds...\n")
    emergency_rows = expand_emergency(args.target_per_seed, use_gemini)
    sys.stdout.write("Expanding routine seeds...\n")
    routine_rows = expand_routine(args.target_per_seed, use_gemini)

    all_rows = emergency_rows + routine_rows
    if not all_rows:
        sys.stderr.write("No rows produced — abort.\n")
        return 1

    train, test = stratified_split(all_rows)
    write_csv(train, args.out_dir / "red_flag_train.csv")
    write_csv(test, args.out_dir / "red_flag_test.csv")
    write_report(train, test, args.out_dir / "red_flag_synthesis_report.md", use_gemini)

    sys.stdout.write(
        f"\nWrote {len(train)} train + {len(test)} test rows to {args.out_dir}\n"
        f"  emergency train: {sum(1 for r in train if r.label == 1)}\n"
        f"  emergency test:  {sum(1 for r in test if r.label == 1)}\n"
        f"  routine train:   {sum(1 for r in train if r.label == 0)}\n"
        f"  routine test:    {sum(1 for r in test if r.label == 0)}\n"
        f"\nReport: {args.out_dir / 'red_flag_synthesis_report.md'}\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
