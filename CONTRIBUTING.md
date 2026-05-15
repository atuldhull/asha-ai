# Contributing to ASHA-AI

Thanks for your interest. ASHA-AI is a voice-first AI triage decision-support tool for rural India. Contributions that **maintain our safety guarantees** are welcome; contributions that bypass them are not.

## Before opening a PR

1. Read [docs/METHODOLOGY.md](docs/METHODOLOGY.md) to understand the three-layer architecture (LLM extractor → 9 deterministic red-flag rules → XGBoost severity + ESI v5 mapper, with `final_level = max(rule_level, esi_level)`).
2. Run the three self-tests on your branch and confirm GREEN:

   ```powershell
   # From D:\hack with .venv activated
   python -m backend.app.nlp.safety_refusals       # expect 18/18 PASS
   cd backend && python -m app.llm.post_process    # expect 11/11 PASS
   python ml/train_and_eval.py                     # expect "Emergency misses: 0 of 15"
   ```

3. Run the full pytest suite — must remain at 169 passing, 1 skipped (as of Plan 5.1 + 6.1 + 6.4):

   ```powershell
   cd backend && pytest -q
   ```

4. If any of the above degrade, the PR will be rejected by the floor regression test at [`tests/test_eval_p4.py`](backend/tests/test_eval_p4.py).

## What we welcome

| Area | Examples | Where |
|---|---|---|
| Bug fixes | Off-by-one, regex edge cases, type errors | Anywhere |
| New language pipelines | One-line additions to `LANGUAGE_PIPELINES` | [`backend/app/nlp/bhashini.py`](backend/app/nlp/bhashini.py) |
| Additional eval cases | Must include source citation in `notes` column | [`docs/EVAL_CASES.csv`](docs/EVAL_CASES.csv) |
| RAG snippets | Must cite WHO / MoHFW / NICE / peer-reviewed source | [`ml/rag/corpus.jsonl`](ml/rag/corpus.jsonl) (re-run `ml/rag/embed.py` after) |
| Documentation | Especially translations of [`docs/MOBILE_CONSENT.md`](docs/MOBILE_CONSENT.md) into Indian languages | `docs/` |
| Test cases | Adversarial inputs that break our regex layers — we want to know | `backend/tests/` |

## What we do NOT accept

- Replacing rules R1–R9 with an ML classifier — architectural choice, see [docs/RED_FLAGS.md](docs/RED_FLAGS.md) §"Why deterministic"
- Removing the `final_level = max(rule_level, esi_level)` safety constraint — load-bearing invariant
- Hardcoded medical advice text (we are decision-support, not diagnostic) — see [docs/METHODOLOGY.md](docs/METHODOLOGY.md) §"Scope"
- Dependencies that don't run offline — breaks edge mode
- Removal of the safety-refusal classifier — DPDP + medical-ethics requirement

## Issue labels

| Label | Meaning |
|---|---|
| `good-first-issue` | New contributors start here — small, well-defined |
| `clinical-review` | Needs MBBS reviewer input before merge ([MBBS_TRACKER.md](docs/MBBS_TRACKER.md)) |
| `regulatory` | Touches DPDP / CDSCO / SaMD scope — review before merge |
| `voice-language` | Bhashini / Indic-language pipeline scope |
| `safety-rule` | Touches R1–R9, post_process.py, or safety_refusals.py — extra-careful review |
| `breaking-change` | Alters a public API; needs major version bump (`backend/app/main.py` version string) |
| `regression-floor` | Touches [`backend/tests/test_eval_p4.py`](backend/tests/test_eval_p4.py) — never merge without floor pass |

## PR checklist

Copy this into your PR description:

```markdown
- [ ] Three self-tests still GREEN (safety_refusals 18/18, post_process 11/11, eval 0/15)
- [ ] `pytest` passes (169 passed, 1 skipped baseline)
- [ ] No changes to R1–R9 rule definitions OR clinical-review label applied
- [ ] No new dependencies that break offline operation OR documented in PR
- [ ] If touching `docs/EVAL_CASES.csv`: source citation in `notes` column
- [ ] If touching i18n: native-speaker review noted in PR
```

## Code style

- Python: black + ruff (config in `pyproject.toml`)
- TypeScript: Prettier + ESLint (config in `frontend/.prettierrc`)
- Markdown: keep tables left-aligned, prefer fenced code blocks over inline for >2 lines

## Where to ask

- General questions → open a [Discussion](https://github.com/atuldhull/Heath/discussions)
- Confirmed bug with reproduction → open an [Issue](https://github.com/atuldhull/Heath/issues)
- Security / privacy / safety concern → email bhagat.singh@wiffy.ai (do not open a public issue)

## License

By contributing, you agree your contributions are licensed under MIT (same as the repo). See [LICENSE](LICENSE).
