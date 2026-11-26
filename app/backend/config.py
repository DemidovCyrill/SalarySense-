"""Настройки бэкенда SalarySense.

Значения читаются из переменных окружения, а для локального запуска — из
файла ``.env`` в корне репозитория. Файл ``.env`` не коммитится: в нём лежит
ключ OpenRouter. Приоритет у переменных окружения.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv(path: Path) -> None:
    """Читает простой ``KEY=VALUE``-файл, не перезаписывая окружение."""
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    try:
        return int(value) if value is not None else default
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    value = os.environ.get(name)
    try:
        return float(value) if value is not None else default
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    """Параметры процесса. Значения по умолчанию безопасны для локального запуска."""

    host: str = "127.0.0.1"
    port: int = 8000
    database_path: Path = field(default_factory=lambda: ROOT / "var" / "salarysense.sqlite3")
    static_dir: Path = field(default_factory=lambda: ROOT / "app" / "frontend" / "public")
    data_dir: Path = field(default_factory=lambda: ROOT / "app" / "backend" / "data")
    benchmark_dir: Path = field(default_factory=lambda: ROOT / "benchmark")
    cookie_name: str = "salarysense_session"
    secure_cookies: bool = False
    body_limit: int = 24_000
    editor_available: bool = True
    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_api_key: str = ""
    llm_model: str = "openai/gpt-4o-mini"
    llm_fallbacks: tuple[str, ...] = ()
    llm_timeout: float = 45.0
    llm_max_tokens: int = 500
    rag_top_k: int = 5
    rag_min_score: float = 0.0
    rag_context_chars: int = 1200
    benchmark_judge: str = "both"

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_api_key)

    @classmethod
    def from_env(cls) -> Settings:
        _load_dotenv(ROOT / ".env")
        fallbacks = tuple(
            item.strip()
            for item in os.environ.get("OPENROUTER_FALLBACK_MODELS", "").split(",")
            if item.strip()
        )
        return cls(
            host=os.environ.get("HOST", "127.0.0.1"),
            port=_env_int("PORT", 8000),
            database_path=Path(
                os.environ.get("SALARYSENSE_DB", str(ROOT / "var" / "salarysense.sqlite3"))
            ),
            secure_cookies=_env_bool("SALARYSENSE_SECURE_COOKIES", False),
            editor_available=_env_bool("SALARYSENSE_EDITOR", True),
            llm_api_key=os.environ.get("OPENROUTER_API_KEY", "").strip(),
            llm_model=os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini").strip(),
            llm_fallbacks=fallbacks,
            llm_timeout=_env_float("OPENROUTER_TIMEOUT", 45.0),
            rag_top_k=_env_int("RAG_TOP_K", 4),
            rag_min_score=_env_float("RAG_MIN_SCORE", 0.0),
            rag_context_chars=_env_int("RAG_CONTEXT_CHARS", 1200),
            benchmark_judge=os.environ.get("BENCHMARK_JUDGE", "keyfacts").strip(),
        )
