# Contributing to ASHA-AI

ASHA-AI is a clinical triage decision-support tool. Contributions that **maintain the
safety guarantees** are welcome; contributions that bypass them are not.

## Before opening a PR

1. Read [docs/METHODOLOGY.md](docs/METHODOLOGY.md) to understand the three-layer
   architecture: LLM symptom extractor → 9 deterministic red-flag rules → ML severity
   model + ESI v5 mapper, with the invariant `final_level = max(rule_level, esi_level)`.
2. Run the test suite and confirm it is green:

   ```bash
   cd backend && pytest -q
   ```

3. Run the evaluation regression and confirm **zero emergency misses**:

   ```bash
   cd ml && python run_eval.py
   ```

4. If either degrades, the PR will be rejected by the regression floor in
   [`backend/tests/test_eval_p4.py`](backend/tests/test_eval_p4.py).

## What we welcome

| Area | Examples |
|---|---|
| Bug fixes | Edge-case regex, type errors, off-by-one |
| New language pipelines | Additions to the language pipeline map in the NLP layer |
| Evaluation cases | New cases **with a source citation** in the `notes` column |
| Retrieval snippets | Must cite WHO / MoHFW / NICE / peer-reviewed source |
| Documentation | Clarifications and Indian-language translations |
| Adversarial tests | Inputs that defeat the regex layers — we want to know |

## What we do NOT accept

- Replacing rules R1–R9 with an ML classifier — deterministic by design, see
  [docs/RED_FLAGS.md](docs/RED_FLAGS.md).
- Removing the `final_level = max(rule_level, esi_level)` safety constraint.
- Hardcoded medical advice text — this is decision-support, not diagnosis.
- Dependencies that cannot run offline — breaks edge mode.
- Removal of the safety-refusal classifier.

## PR checklist

```markdown
- [ ] `pytest` green; evaluation shows 0 emergency misses
- [ ] No changes to R1–R9 rule definitions without clinical review
- [ ] No new dependencies that break offline operation
- [ ] Care-level strings remain exact: Home Care / Clinic Visit / Emergency Room
- [ ] i18n changes reviewed by a native speaker
```

## Code style

- Python: `black` + `ruff` (configured in `pyproject.toml`)
- TypeScript: Prettier + ESLint (configured under `frontend/`)
- Markdown: left-aligned tables; fenced code blocks for anything over two lines

## Where to ask

- General questions → open a [Discussion](https://github.com/atuldhull/Heath/discussions)
- Reproducible bug → open an [Issue](https://github.com/atuldhull/Heath/issues)
- Security / privacy / safety concern → email the maintainer; do not open a public issue

## License

By contributing, you agree your contributions are licensed under MIT (same as the repo).
See [LICENSE](LICENSE).
