"""Background jobs that run outside the request path.

Each job is a callable that does one pass and exits. Schedulers
(cron, apscheduler, GitHub Actions on schedule, k8s CronJob, etc.)
are wired via [docs/PENDING_USER_ACTIONS.md] PLAN 6.6 Phase J.
"""
