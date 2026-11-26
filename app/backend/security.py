"""Сессии, cookie и проверка источника запроса.

Cookie — единственный идентификатор владельца. Сервер не доверяет
параметрам запроса при доступе к профилю или попытке: чужая сессия просто
не находит запись. Для локальной версии дополнительно проверяется Origin,
чтобы сторонний сайт не мог отправить изменение от имени открытой вкладки.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import Request, Response

from .config import Settings
from .model import new_session
from .store import SessionStore

SESSION_ID = re.compile(r"^[0-9a-f]{32}$")


def same_origin(request: Request) -> bool:
    """Пустой Origin допустим (curl, тесты); чужой Origin — нет."""
    origin = request.headers.get("origin")
    if not origin:
        return True
    host = request.headers.get("host", "")
    return origin == f"{request.url.scheme}://{host}"


@dataclass
class SessionService:
    """Создаёт сессию при первом запросе и сохраняет изменения после ответа."""

    settings: Settings
    store: SessionStore

    def open(self, request: Request) -> tuple[str, dict[str, Any], bool]:
        raw = request.cookies.get(self.settings.cookie_name, "")
        state = self.store.get(raw) if SESSION_ID.match(raw) else None
        if state is not None:
            return raw, state, False
        session_id = uuid.uuid4().hex
        state = new_session(sample=True)
        return session_id, state, True

    def rotate(self, request: Request) -> tuple[str, dict[str, Any]]:
        """Удаляет профиль и выдаёт новую пустую сессию."""
        old = getattr(request.state, "session_id", None)
        if old:
            self.store.delete(old)
        session_id = uuid.uuid4().hex
        state = new_session(sample=False)
        return session_id, state

    def commit(self, request: Request, response: Response, state: dict[str, Any]) -> None:
        """Сохраняет состояние и выставляет cookie, если сессия новая."""
        session_id = getattr(request.state, "session_id", None)
        if not session_id:
            return
        is_new = bool(getattr(request.state, "session_new", False))
        if request.method != "GET" or is_new:
            self.store.save(session_id, state)
        if is_new:
            response.set_cookie(
                self.settings.cookie_name,
                session_id,
                httponly=True,
                samesite="strict",
                secure=self.settings.secure_cookies,
                max_age=60 * 60 * 24 * 30,
                path="/",
            )
            response.headers.setdefault("Cache-Control", "no-store")
