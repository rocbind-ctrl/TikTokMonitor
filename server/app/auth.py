import secrets

from fastapi import Request
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_security_settings

_sessions: set[str] = set()

PUBLIC_PATHS = {
    "/login",
    "/api/health",
    "/api/auth/login",
    "/api/auth/session",
    "/api/v2/health",
    "/api/v2/auth/login",
    "/api/v2/auth/session",
}


def create_session() -> str:
    token = secrets.token_urlsafe(32)
    _sessions.add(token)
    return token


def destroy_session(token: str | None) -> None:
    if token:
        _sessions.discard(token)


def verify_api_key(request: Request) -> bool:
    settings = get_security_settings()
    key = (settings.get("api_key") or "").strip()
    if not key:
        return False
    provided = request.headers.get("X-API-Key") or request.query_params.get("key", "")
    return secrets.compare_digest(provided, key)


def web_auth_enabled() -> bool:
    return bool((get_security_settings().get("web_password") or "").strip())


def is_web_authenticated(request: Request) -> bool:
    if not web_auth_enabled():
        return True
    token = request.cookies.get("monitor_session", "")
    return token in _sessions


def check_access(request: Request) -> bool:
    if verify_api_key(request):
        return True
    return is_web_authenticated(request)


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if request.method == "OPTIONS":
            return await call_next(request)
        if path.startswith("/static") or path in PUBLIC_PATHS:
            return await call_next(request)
        if check_access(request):
            return await call_next(request)
        if path.startswith("/api/v2/"):
            return JSONResponse(
                status_code=401,
                content={"ok": False, "data": None, "error": {"code": "unauthorized", "message": "Unauthorized"}},
            )
        if path.startswith("/api/"):
            return JSONResponse(status_code=401, content={"error": "unauthorized"})
        return RedirectResponse(url="/login", status_code=303)
