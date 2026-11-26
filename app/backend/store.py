"""Хранилище сессий на SQLite.

Сессия — это владелец профиля, попыток и материалов. Состояние хранится
одним JSON-документом: для первой версии этого достаточно, а таблица
``sessions`` даёт сохранность между перезапусками и проверку владельца по
cookie. Секреты и ключи ответов в браузер не попадают — их отсекают
публичные сериализаторы.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def _normalize(state: dict[str, Any]) -> dict[str, Any]:
    """Возвращает состоянию те типы, которые ожидает код после JSON-хранилища.

    Ключи словаря ответов в JSON всегда строки, а в коде позиция вопроса —
    целое число. Без приведения попытка после перезапуска теряла бы ответы.
    """
    for attempt in state.get("attempts", []):
        answers = attempt.get("answers") or {}
        attempt["answers"] = {int(key): value for key, value in answers.items()}
    return state


class SessionStore:
    """Минимальный слой доступа к таблице сессий."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        with self._connect() as connection:
            connection.execute(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        return connection

    def get(self, session_id: str) -> dict[str, Any] | None:
        if not session_id:
            return None
        with self._connect() as connection:
            row = connection.execute(
                "SELECT state FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
        if row is None:
            return None
        return _normalize(json.loads(row["state"]))

    def save(self, session_id: str, state: dict[str, Any]) -> None:
        payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        now = datetime.now(UTC).isoformat(timespec="seconds")
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO sessions (id, state, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
                """,
                (session_id, payload, now, now),
            )

    def delete(self, session_id: str) -> None:
        with self._lock, self._connect() as connection:
            connection.execute("DELETE FROM sessions WHERE id = ?", (session_id,))

    def count(self) -> int:
        with self._connect() as connection:
            row = connection.execute("SELECT COUNT(*) AS total FROM sessions").fetchone()
        return int(row["total"])
