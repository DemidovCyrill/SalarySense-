"""Ошибки API в форме, которую ждёт фронтенд: HTTP-статус и поле ``message``."""

from __future__ import annotations


class ApiError(Exception):
    """Ожидаемая ошибка запроса. Не логируется как сбой сервера."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
