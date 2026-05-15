"""Plan 6.6 Phase A — Auth module.

Phone-OTP + JWT (access+refresh rotation) + 4-role RBAC.

Public surface:
  - `routers.auth_router` (mounted in app/main.py at /api/v1/auth)
  - `dependencies.current_user(required_role=...)` — FastAPI dependency
  - `models.UserRole` — Patient / CHW / Doctor / Admin

Provider is pluggable via `OTP_PROVIDER` env var (`msg91` default; `twilio` shim).
"""
from app.auth.dependencies import current_user, require_role
from app.auth.models import UserRole
from app.auth.routers import auth_router

__all__ = ["auth_router", "current_user", "require_role", "UserRole"]
