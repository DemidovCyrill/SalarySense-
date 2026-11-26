"""Сборка FastAPI-приложения SalarySense.

Один процесс отдаёт интерфейс из ``app/frontend/public``, продуктовый API
``/api/v1`` и вопрос базе знаний ``POST /ask``. Ошибки возвращаются с полем
``message`` — так их читает ``app/frontend/public/api.js``.
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import api
from .config import Settings
from .errors import ApiError
from .rag.answer import RagService
from .security import SessionService, same_origin
from .store import SessionStore

logger = logging.getLogger(__name__)

CSP = (
    "default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; "
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
)


def _error(status: int, message: str) -> JSONResponse:
    return JSONResponse({"message": message}, status_code=status)


def create_app(settings: Settings | None = None, *, rag: RagService | None = None) -> FastAPI:
    """Создаёт приложение. В тестах можно передать свои настройки и RAG-сервис."""
    settings = settings or Settings.from_env()
    app = FastAPI(
        title="SalarySense API",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redirect_slashes=False,
    )
    app.state.settings = settings
    app.state.store = SessionStore(settings.database_path)
    app.state.sessions = SessionService(settings, app.state.store)
    app.state.rag = rag or RagService(settings)

    app.include_router(api.router, prefix="/api/v1")
    app.add_api_route("/ask", api.ask, methods=["POST"], name="ask")
    app.add_api_route("/ask", api.ask_get, methods=["GET"], name="ask-get")
    app.add_api_route("/health", api.health, methods=["GET"], name="health")

    @app.middleware("http")
    async def session_and_headers(request: Request, call_next):
        path = request.url.path
        is_api = path == "/ask" or path.startswith("/api/v1/")
        if is_api and not same_origin(request):
            return _error(403, "Источник запроса не совпадает.")
        if is_api:
            session_id, state, created = app.state.sessions.open(request)
            request.state.session_id = session_id
            request.state.session_state = state
            request.state.session_new = created
        response = await call_next(request)
        if is_api:
            app.state.sessions.commit(request, response, request.state.session_state)
            response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        if response.headers.get("content-type", "").startswith("text/html"):
            response.headers.setdefault("Content-Security-Policy", CSP)
        return response

    @app.exception_handler(ApiError)
    async def api_error(_: Request, error: ApiError) -> JSONResponse:
        return _error(error.status, error.message)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, error: StarletteHTTPException) -> JSONResponse:
        if error.status_code == 404:
            return _error(404, "Действие недоступно.")
        if error.status_code == 405:
            return _error(405, "Метод не поддерживается.")
        return _error(error.status_code, str(error.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
        return _error(400, "Проверьте параметры запроса.")

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, error: Exception) -> JSONResponse:
        logger.exception("Необработанная ошибка на %s", request.url.path, exc_info=error)
        return _error(500, "Не удалось выполнить запрос. Попробуйте ещё раз.")

    if settings.static_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="static")
    return app


def run() -> None:
    """Запуск из ``python -m app``."""
    import uvicorn

    settings = Settings.from_env()
    print(f"SalarySense · http://{settings.host}:{settings.port}")
    uvicorn.run(
        create_app(settings),
        host=settings.host,
        port=settings.port,
        log_level=os.environ.get("LOG_LEVEL", "info").lower(),
    )
