"""FastAPI dependencies for auth — Plan 6.6 Phase A.

Two flavors:
  - `current_user` — requires a valid Bearer token; raises 401 otherwise.
  - `optional_current_user` — returns None for anonymous (keeps /triage
    anonymous-friendly per the Plan 4.0 demo posture).
  - `require_role(min_role)` — RBAC enforcement; raises 403 on insufficient role.

Usage:
    @router.get("/admin/users")
    def list_users(user: CurrentUser = Depends(require_role(UserRole.ADMIN))):
        ...

    @router.post("/triage")
    def triage(body: TriageBody, user: CurrentUser | None = Depends(optional_current_user)):
        # anonymous OK; user is None for unauthenticated requests.
        ...
"""
from __future__ import annotations

from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt import verify
from app.auth.models import ROLE_LEVEL, CurrentUser, UserRole

_bearer = HTTPBearer(auto_error=False)


async def optional_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser | None:
    """Returns the user if a valid Bearer token is present, else None.

    Triage / consent flows that explicitly allow anonymous use depend on this.
    """
    if creds is None or not creds.credentials:
        return None
    return verify(creds.credentials, expected_type="access")


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    """Required auth — raises 401 if no valid token."""
    if creds is None or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = verify(creds.credentials, expected_type="access")
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_role(min_role: UserRole) -> Callable:
    """Returns a dependency that enforces the role hierarchy.

    Admin > Doctor > CHW > Patient. A request needs role-level >= min_role.
    """
    min_level = ROLE_LEVEL[min_role]

    async def _dep(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if ROLE_LEVEL.get(user.role, -1) < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {min_role.value} or higher.",
            )
        return user

    return _dep
