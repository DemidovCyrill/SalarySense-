r"""Преобразует JSONL-корпус в JSON-корпус бэкенда.

Во внешнем наборе документы имеют длинные ID вида ``4vFrrqDMc2pmbLStKMQJ9j``.
Для чата «База знаний» удобнее короткие ID: модель надёжнее цитирует
``[S001]``, а исходный ID сохраняется в ``source.section``.

    python tools/jsonl_to_corpus.py --input corpus.jsonl --output songs-corpus.json

Тексты остаются во входном файле; выходной JSON тоже не коммитится, если у
корпуса нет прав на распространение.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path


def convert(
    source: Path, target: Path, prefix: str = "S", version: str = "external-corpus-1"
) -> int:
    documents: list[dict[str, object]] = []
    seen: set[str] = set()
    with source.open(encoding="utf-8") as handle:
        for number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError as error:
                raise SystemExit(f"Строка {number} не читается: {error}") from None
            original_id = raw.get("id")
            title = raw.get("title")
            artist = raw.get("artist", "")
            text = raw.get("text")
            if not all(
                isinstance(value, str) and value.strip() for value in (original_id, title, text)
            ):
                raise SystemExit(f"Строка {number}: нужны непустые id, title, text.")
            if original_id in seen:
                raise SystemExit(f"Повторяющийся id: {original_id}")
            seen.add(original_id)
            documents.append(
                {
                    "id": f"{prefix}{number:03d}",
                    "title": f"{title} — {artist}" if artist else title,
                    "text": text,
                    "source": {
                        "doc": source.name,
                        "section": original_id,
                        "artist": artist,
                    },
                }
            )
    if not documents:
        raise SystemExit("Корпус пуст.")
    payload = {
        "version": version,
        "created": datetime.now(UTC).date().isoformat(),
        "documents": documents,
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(documents)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="JSONL → JSON-корпус SalarySense")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--prefix", default="S")
    parser.add_argument("--version", default="external-corpus-1")
    args = parser.parse_args(argv)
    count = convert(args.input, args.output, args.prefix, args.version)
    print(f"{count} документов → {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
