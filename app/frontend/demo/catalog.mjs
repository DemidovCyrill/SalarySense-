export const snapshot = { version: 'demo-market-v1', date: '2026-11-26', from: '2026-11-01', source: 'Учебная выборка SalarySense', mode: 'demo' };
export const regions = ['Любой регион', 'Москва', 'Санкт-Петербург', 'Казань'];
export const formats = ['Любой формат', 'Удалённо', 'Гибрид', 'Офис'];
export const levels = ['Intern', 'Junior', 'Middle', 'Senior', 'Lead'];
export const dimensions = ['Знания', 'Практика', 'Самостоятельность', 'Ответственность', 'Влияние'];
export const experience = ['Изучал', 'Учебный проект', 'Рабочая задача', 'Самостоятельное внедрение'];

const skill = (id, name, group, description, aliases = []) => ({ id, name, group, description, aliases });
const items = [
  skill('html-css', 'HTML и CSS', 'Разработка', 'Разметка, адаптивные сетки и каскад стилей.', ['вёрстка', 'верстка', 'семантика', 'layout']),
  skill('javascript', 'JavaScript', 'Разработка', 'Типы данных, функции и асинхронный код.', ['js', 'ecmascript', 'промисы']),
  skill('typescript', 'TypeScript', 'Разработка', 'Типы, интерфейсы и моделирование данных.', ['ts', 'типизация']),
  skill('react', 'React', 'Разработка', 'Компоненты, состояние и эффекты.', ['reactjs', 'hooks', 'хуки']),
  skill('web-a11y', 'Доступность', 'Качество', 'Семантика, клавиатурная навигация и фокус.', ['a11y', 'accessibility', 'wcag']),
  skill('testing', 'Автотесты', 'Качество', 'Модульные и интеграционные проверки.', ['testing', 'jest', 'тестирование']),
  skill('api', 'REST API', 'Инструменты', 'HTTP, ресурсы и обработка ошибок.', ['http', 'rest', 'запросы']),
  skill('git', 'Git', 'Инструменты', 'История, ветки и командная работа с кодом.', ['github', 'gitlab', 'ветки']),
  skill('sql', 'SQL', 'Данные', 'Запросы, объединения и агрегация таблиц.', ['postgres', 'базы данных', 'join']),
  skill('java', 'Java', 'Разработка', 'Основы языка и коллекции.'),
  skill('kotlin', 'Kotlin', 'Разработка', 'Модели данных и асинхронные операции.'),
  skill('test-design', 'Тест-дизайн', 'Качество', 'Классы эквивалентности и граничные значения.', ['qa']),
  skill('linux', 'Linux', 'Инфраструктура', 'Процессы, права и диагностика.'),
  skill('ci', 'CI/CD', 'Инфраструктура', 'Автоматизация сборки и выпуска.', ['пайплайн']),
  skill('docker', 'Docker', 'Инфраструктура', 'Контейнеры и образы.'),
  skill('threat', 'Моделирование угроз', 'Безопасность', 'Границы доверия и описание рисков.'),
  skill('identity', 'Управление доступом', 'Безопасность', 'Роли, разрешения и аудит.'),
  skill('python', 'Python', 'Данные', 'Подготовка данных и автоматизация.'),
  skill('metrics', 'Метрики', 'Аналитика', 'Определение метрик и разбор изменений.'),
  skill('ml', 'Оценка моделей', 'Данные', 'Валидация, ошибки и качество прогнозов.'),
  skill('research', 'Исследования', 'Дизайн', 'Интервью, наблюдение и синтез.'),
  skill('prototyping', 'Прототипирование', 'Дизайн', 'Сценарии взаимодействия и прототипы.', ['figma']),
  skill('product', 'Продуктовые гипотезы', 'Управление', 'Постановка и проверка гипотез.'),
  skill('delivery', 'Управление поставкой', 'Управление', 'Риски, зависимости и планирование.'),
  skill('mentoring', 'Наставничество', 'Управление', 'Обратная связь и развитие команды.'),
];
export const skills = Object.fromEntries(items.map(item => [item.id, item]));

export const directions = [
  { id:'development', name:'Разработка', icon:'code' },
  { id:'quality', name:'Тестирование', icon:'shield' },
  { id:'infra', name:'Инфраструктура', icon:'layers' },
  { id:'security', name:'Безопасность', icon:'lock' },
  { id:'data', name:'Данные и аналитика', icon:'chart' },
  { id:'design', name:'Дизайн', icon:'pen' },
  { id:'management', name:'Продукт и управление', icon:'target' },
];
const role = (id, direction, name, description, skillIds, criteria = false) => ({
  id, direction, name, description, skillIds, criteria, catalog: skillIds.length > 4 ? 'Демо-каталог' : 'Базовый каталог',
});
export const roles = [
  role('frontend','development','Frontend-разработчик','Интерфейсы веб-приложений и качество пользовательского опыта.', ['html-css','javascript','typescript','react','web-a11y','testing','api','git'], true),
  role('backend','development','Backend-разработчик','Серверные сервисы, API и хранение данных.', ['java','api','sql','git','testing','ci'], true),
  role('mobile','development','Mobile-разработчик','Приложения и взаимодействие с мобильной платформой.', ['kotlin','api','git','testing','ci']),
  role('qa','quality','QA-инженер','Сценарии проверки, автоматизация и качество продукта.', ['test-design','testing','api','sql','git'], true),
  role('devops','infra','DevOps-инженер','Инфраструктура, доставка изменений и надежность сервисов.', ['linux','docker','ci','git']),
  role('security','security','Инженер безопасности','Анализ рисков и проектирование защитных мер.', ['threat','identity','linux','api']),
  role('analyst','data','Аналитик данных','Измерение продукта, запросы и интерпретация данных.', ['sql','python','metrics','git']),
  role('ml','data','ML-инженер','Подготовка данных, модели и оценка качества.', ['python','sql','ml','docker']),
  role('designer','design','Продуктовый дизайнер','Исследования, прототипы и доступность интерфейсов.', ['research','prototyping','web-a11y','metrics']),
  role('pm','management','Продакт-менеджер','Гипотезы, продуктовые метрики и работа с командой.', ['product','metrics','research','delivery']),
  role('lead','management','Tech Lead','Техническое направление, поставка и развитие команды.', ['delivery','mentoring','ci','api']),
];
export const getRole = id => roles.find(item => item.id === id);

const requirement = (id, text, weight, mandatory = false, topic = 'general') => ({
  id, text, weight, mandatory, topic, skill: skills[id].name, expected: 1,
});
const frontendRequirements = [
  requirement('javascript','Работать с промисами, обрабатывать ошибки асинхронных операций.',3,true,'async'),
  requirement('react','Разрабатывать компоненты и управлять состоянием интерфейса.',3,true,'state'),
  requirement('typescript','Описывать типы данных и интерфейсы приложения.',2,true),
  requirement('testing','Поддерживать модульные тесты интерфейсов.',2),
];
const frontendVariants = [
  frontendRequirements,
  [
    requirement('html-css','Верстать доступные адаптивные интерфейсы по макетам.',3,true),
    frontendRequirements[0],
    frontendRequirements[1],
    requirement('git','Работать с ветками и участвовать в ревью изменений.',1),
  ],
  [
    requirement('react','Проектировать состояние сложных приложений и границы модулей.',4,true,'architecture'),
    requirement('web-a11y','Разбирать проблемы фокуса и навигации с клавиатуры.',2,true,'interaction'),
    frontendRequirements[2],
    frontendRequirements[3],
  ],
];
const backendRequirements = [
  requirement('java','Использовать основные коллекции и типы Java.',3,true),
  requirement('api','Разрабатывать и поддерживать REST API.',3,true),
  requirement('sql','Объединять таблицы и агрегировать результаты.',2,true,'joins'),
  requirement('ci','Поддерживать пайплайны сборки и доставки.',2),
];
const companyNames = ['Orbit Studio','Northstar Labs','Forma Digital','Vertex Team','Signal Works','Nova Collective','Kite Systems','Layer Studio','Atlas Works','Grid Space','Tidal Code','Vector Lab','Basis Team','Pulse Works','Mosaic Lab','Lumen Team','Shift Studio','Index Lab','Pixel Group','Core Space','Unit Works','Scale Lab','Field Studio','Cloud Team'];
const frontMids = [245,230,215,150,160,170,180,190,200,210,220,240,250,260,270,280,300,320,235,250];
const backMids = [260,250,235,170,180,190,200,210,220,230,240,250,260,270,280,290,310,330,250,280];

function offers(roleId, midpoints, baseRequirements) {
  const current = getRole(roleId);
  return Array.from({ length: midpoints ? 24 : 3 }, (_, index) => {
    const midpoint = midpoints?.[index] ?? 130 + 30 * index;
    const level = ['Middle','Middle','Senior','Junior','Middle','Junior','Middle','Middle','Middle','Middle','Middle','Senior','Senior','Senior','Senior','Senior','Lead','Lead','Junior','Middle'][index] ?? 'Middle';
    const variant = roleId === 'frontend' ? frontendVariants[index] : null;
    const requirements = variant ?? baseRequirements ?? current.skillIds.slice(0,3).map((id, position) => requirement(id, skills[id].description, 3 - position, position === 0, id === 'sql' ? 'joins' : 'general'));
    const salary = index >= 22 ? null : { min: index === 21 ? null : (midpoint - 25) * 1000, max: index === 20 ? null : (midpoint + 25) * 1000, currency:'RUB', tax: index === 19 ? 'net' : 'gross', period:'month' };
    const titles = roleId === 'frontend' ? ['Frontend Developer (React)','Frontend-разработчик','Senior Frontend Engineer'] : [];
    return {
      id: `${roleId}-${index + 1}`, roleId, title: titles[index] ?? `${current.name} · ${level}`, company: companyNames[index], brand: index % 4,
      level, region: regions[index % 3 + 1], format: formats[1 + (index < 3 ? index === 1 ? 1 : 0 : index % 3)],
      mode: snapshot.mode, source: snapshot.source, snapshotVersion: index >= 22 ? 'demo-market-previous-v1' : snapshot.version, url: null,
      published: `2026-11-${String(25 - index).padStart(2,'0')}`, fetched: index >= 22 ? '2026-11-15' : snapshot.date,
      status: index === 22 ? 'stale' : index === 23 ? 'archived' : 'active',
      salary, requirements,
      language: index % 3 === 0 ? 'Английский B1' : 'Уровень языка не указан',
      summary: `Демонстрационная вакансия для роли «${current.name}». Команда развивает продукт и ищет специалиста для работы над основными сценариями.`,
    };
  });
}
export const vacancies = roles.flatMap(item => item.id === 'frontend' ? offers(item.id,frontMids,frontendRequirements)
  : item.id === 'backend' ? offers(item.id,backMids,backendRequirements) : offers(item.id));

export const checks = [
  { id:'frontend-js', roleId:'frontend', skillId:'javascript', topic:'async', title:'Асинхронный JavaScript', scope:'Промисы и обработка ошибок', limit:'Практика в коммерческом проекте и архитектура асинхронных систем.', version:'js-demo-v1', source:'Учебный банк SalarySense', minutes:3, questions:[
    { text:'Что вернёт вызов async-функции, если внутри она возвращает число 7?', options:['Число 7','Промис, который выполнится со значением 7','Объект события','Ничего до вызова await'], answer:1, area:'Возвращаемое значение async-функции' },
    { text:'Как перехватить отклонение промиса при использовании await?', options:['Объявить переменную через const','Поместить await в блок try и обработать ошибку в catch','Вызвать Promise.all без ожидания','Добавить return перед await'], answer:1, area:'Обработка ошибок' },
    { text:'Что происходит с Promise.all, если один из промисов отклоняется?', options:['Результат отклоняется','Результат выполняется со значением остальных промисов','Остальные промисы автоматически отменяются','Все операции запускаются заново'], answer:0, area:'Параллельные операции' },
  ] },
  { id:'frontend-react', roleId:'frontend', skillId:'react', topic:'state', title:'Состояние в React', scope:'Локальное состояние и обновление компонентов', limit:'Архитектура приложений и опыт командной разработки.', version:'react-demo-v1', source:'Учебный банк SalarySense', minutes:3, questions:[
    { text:'Какой хук хранит локальное состояние функционального компонента?', options:['useRef','useMemo','useState','useEffect'], answer:2, area:'Хранение состояния' },
    { text:'Как увеличить счётчик на основе предыдущего значения?', options:['count += 1','setCount(previous => previous + 1)','setCount(count++)','useEffect(count + 1)'], answer:1, area:'Функциональное обновление' },
    { text:'Где разместить состояние, необходимое двум соседним компонентам?', options:['В каждом соседнем компоненте независимо','В их общем родителе','В атрибуте HTML','В CSS-переменной'], answer:1, area:'Совместное состояние' },
  ] },
  ...['backend','qa','analyst'].map(roleId => ({ id:`${roleId}-sql`, roleId, skillId:'sql', topic:'joins', title:'SQL: JOIN и группировка', scope:'Объединение таблиц и агрегаты', limit:'Проектирование базы, оптимизация запросов и производственный опыт.', version:'sql-demo-v1', source:'Учебный банк SalarySense', minutes:3, questions:[
    { text:'Какое объединение оставит все строки левой таблицы?', options:['INNER JOIN','LEFT JOIN','CROSS JOIN','Ни одно'], answer:1, area:'Семантика соединений' },
    { text:'Как отфильтровать группы после GROUP BY?', options:['WHERE','ORDER BY','HAVING','LIMIT'], answer:2, area:'Условия для агрегатов' },
    { text:'Что считает COUNT(*) внутри каждой группы?', options:['Количество строк','Сумму значений','Количество уникальных таблиц','Среднее значение'], answer:0, area:'Подсчёт строк' },
  ]})),
];
const levelDescriptions = [
  ['Объясняет основные понятия роли.','Выполняет учебную задачу по инструкции.','Нуждается в сопровождении.','Сообщает о затруднениях.','Обсуждает решение с наставником.'],
  ['Применяет основные инструменты.','Выполняет типовые задачи с ревью.','Уточняет условия и ограничения.','Отвечает за результат отдельной задачи.','Делится контекстом с командой.'],
  ['Выбирает подход к типовым задачам.','Доводит функциональность до выпуска.','Самостоятельно исследует проблему.','Учитывает качество и эксплуатацию.','Предлагает локальные улучшения.'],
  ['Сравнивает подходы и компромиссы.','Ведёт сложные изменения в продукте.','Самостоятельно снижает неопределённость.','Управляет рисками за пределами одной задачи.','Развивает инженерную практику команды.'],
  ['Формирует техническое направление.','Организует поставку сложных изменений.','Согласует решения между командами.','Отвечает за устойчивость решений команды.','Развивает людей и меняет процессы.'],
];
export function initialMaterials() {
  return roles.filter(item => item.criteria).flatMap(item => levels.map((level, index) => ({
    id: `${item.id}-${level.toLowerCase()}`, roleId: item.id, level, type:'criterion', version:1, status:'published',
    topic: item.skillIds[0], source:'Учебная матрица SalarySense', rights:'Оригинальный демонстрационный материал',
    content: levelDescriptions[index].map((text, position) => ({ dimension:dimensions[position], text })), date:snapshot.date,
  }))).concat(checks.map(item => ({
    id:item.id, roleId:item.roleId, level:null, type:'quiz', version:1, status:'published', topic:item.scope,
    source:item.source, rights:'Оригинальный демонстрационный материал', content:[], date:snapshot.date,
    title:item.title, skillId:item.skillId, checkTopic:item.topic, limit:item.limit, minutes:item.minutes,
    bankVersion:item.version.replace(/-v\d+$/,''), questions:structuredClone(item.questions),
  })));
}
