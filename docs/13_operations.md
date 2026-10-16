# Эксплуатация и демонстрация
Предлагаемый runbook, а не описание уже поднятой среды.

## Режимы
APP_MODE=demo|live; JOB_PROVIDER=demo|hh|other; MODEL_PROVIDER=mock|configured; CORPUS_VERSION и SCORING_VERSION фиксированы. Нельзя скрыто переключить live-запрос на синтетические зарплаты. UI показывает режим и дату snapshot. Внешний fetch использует настройки провайдера, ограничения и условия доступа проверяются перед включением.

## Метрики
HTTP latency/error rate; completed assessments; import success/last_success; число active/stale/demo; corpus version; retrieval empty rate; explanation latency/failure/citations rejected; tokens/cost; invalid DTO. Метрики не содержат имён, текста ответов и секретов. Логи: request_id, profile revision, операция и безопасные ID версий.

## Сбои
- Job API 429: backoff с jitter и Retry-After, без бесконечного цикла; последний разрешённый snapshot + stale.
- Job API 401/403: остановить адаптер, проверить права; не обходить доступ парсером автоматически.
- LLM timeout: partial; числовая часть доступна, повтор инициируется пользователем/ограниченной политикой.
- Плохой контент: retired версия, rollback corpus pointer, сохранить аудит.
- Некорректный скоринг: freeze новую выдачу, исправить с новой версией, затронутые результаты отметить, не переписать молча.
- Потеря DB: восстановить backup и проверить связи, владельцев, active pointers.

## Резервирование — цели PROPOSED
Ежедневный зашифрованный backup, RPO 24ч и RTO 4ч для пилота; раз в выпуск выполнить пробное восстановление. Миграции backward-compatible, backup перед изменением схемы. Actual evidence восстановления записывается в run report.

## Перед приватной демонстрацией
Пройти FR acceptance; выключить debug; secret scan; проверить auth gateway с новой сессии; запретить публичную индексацию как дополнительную меру (robots.txt не заменяет auth); проверить backup и budget; проверить факт недоступности private URL постороннему. В этом архиве нет deploy URL и не выполнена публикация.
