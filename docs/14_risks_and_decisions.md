# Риски, допущения и решения
| ID | Риск | Вероятность/влияние | Мера | Роль владельца |
|---|---|---|---|---|
| R01 | Все IT покрыты поверхностно | Высокая/высокое | Coverage per role, ревью и явные недостатки | Content lead |
| R02 | Название уровня выдаёт ложную точность | Высокая/высокое | Model version и dimensions; no official certification | Product |
| R03 | Вопросы ИИ ошибочны | Средняя/высокое | Проверка ключей, независимое ревью, fixed bank | Content reviewer |
| R04 | API недоступно/ограничено | Средняя/высокое | Adapter + честный demo, проверить условия | Backend |
| R05 | Матрица не разрешена для копирования | Средняя/высокое | Source registry usage_status; SFIA excluded default | Content lead |
| R06 | Расходы LLM выше бюджета | Средняя/среднее | Cache, limits, измерение tokens/cost | Operator |
| R07 | Salary selection bias | Высокая/среднее | N, filters, gross/net, midpoint definition | Analyst |
| R08 | Дизайн противоречит контракту | Средняя/среднее | Copy и spec authoritative, visual review | Frontend |

## Открытые вопросы — не блокируют подготовку комплекта
Состав команды; обязательный стек/модель по курсу; бюджет; точный список подролей; доступ HH; провайдер LLM и регион; способ приватного hosting; кто ревьюит критерии; валидность порогов; дополнительные кейсы. Вопросы должны быть закрыты до включения соответствующей live-функции, а не автоматически интерпретироваться как согласие.

## Предлагаемые решения
ADR001 modular monolith; ADR002 scoring separate from generation; ADR003 one canonical content source; ADR004 role coverage; ADR005 job provider abstraction; ADR006 scoped evidence. Статус Proposed, владелец назначается командой. Продуктовый охват всех IT уже подтверждён.
