"""Клиент OpenRouter для генерации ответа по найденному контексту.

Модель получает только вопрос и разрешённые фрагменты корпуса. Ключ читается
из окружения, в ответы API и в журналы не попадает. При сбое модели бэкенд
возвращает ошибку, а не выдуманный ответ; числовые расчёты продукта от модели
не зависят.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

TRANSPORT = Callable[[str, dict[str, Any], dict[str, str], float], dict[str, Any]]


class LlmUnavailable(Exception):
    """Модель недоступна: нет ключа, сеть, лимит или ошибка провайдера."""


@dataclass(frozen=True)
class LlmReply:
    text: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int


def post_json(
    url: str, payload: dict[str, Any], headers: dict[str, str], timeout: float
) -> dict[str, Any]:
    """Один HTTP-запрос без сторонних зависимостей."""
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = ""
        try:
            body = json.loads(error.read().decode("utf-8"))
            detail = str(body.get("error", {}).get("message", ""))[:300]
        except (ValueError, UnicodeDecodeError):
            detail = ""
        raise LlmUnavailable(
            f"OpenRouter ответил {error.code}" + (f": {detail}" if detail else ".")
        ) from None
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise LlmUnavailable(f"Нет связи с моделью: {error}") from None
    except (ValueError, UnicodeDecodeError):
        raise LlmUnavailable("Ответ модели не читается как JSON.") from None


class OpenRouterClient:
    """Вызов chat/completions с ограниченным числом повторов."""

    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        base_url: str = "https://openrouter.ai/api/v1",
        fallbacks: tuple[str, ...] = (),
        timeout: float = 45.0,
        max_tokens: int = 500,
        transport: TRANSPORT = post_json,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not api_key:
            raise LlmUnavailable("Не задан ключ OpenRouter.")
        self.api_key = api_key
        self.models = (model, *fallbacks)
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_tokens = max_tokens
        self.transport = transport
        self.sleep = sleep

    def complete(self, messages: list[dict[str, str]], temperature: float = 0.0) -> LlmReply:
        """Возвращает текст ответа или поднимает ``LlmUnavailable``."""
        last_error = "Модель недоступна."
        for model in self.models:
            payload = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": self.max_tokens,
            }
            for attempt in range(2):
                started = time.monotonic()
                try:
                    body = self.transport(
                        f"{self.base_url}/chat/completions",
                        payload,
                        {
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": "https://github.com/DemidovCyrill/SalarySense-",
                            "X-Title": "SalarySense NIRS",
                        },
                        self.timeout,
                    )
                except LlmUnavailable as error:
                    last_error = str(error)
                    if attempt == 0 and _retryable(str(error)):
                        self.sleep(1.5)
                        continue
                    break
                latency_ms = int((time.monotonic() - started) * 1000)
                try:
                    text = body["choices"][0]["message"]["content"]
                except (KeyError, IndexError, TypeError):
                    last_error = "Ответ модели без текста."
                    break
                usage = body.get("usage") or {}
                reply = LlmReply(
                    text=str(text).strip(),
                    model=str(body.get("model", model)),
                    prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
                    completion_tokens=int(usage.get("completion_tokens", 0) or 0),
                    latency_ms=latency_ms,
                )
                logger.info(
                    "llm: model=%s latency_ms=%s prompt_tokens=%s completion_tokens=%s",
                    reply.model,
                    reply.latency_ms,
                    reply.prompt_tokens,
                    reply.completion_tokens,
                )
                return reply
        raise LlmUnavailable(last_error)


def _retryable(message: str) -> bool:
    lowered = message.lower()
    return any(
        marker in lowered
        for marker in ("429", "500", "502", "503", "504", "нет связи", "timed out", "timeout")
    )
