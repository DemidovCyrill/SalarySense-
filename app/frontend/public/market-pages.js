import {
  back, badge, button, callout, date, empty, escape as e, heading, icon, link, money,
  number, option, options, percent, safeUrl, salaryText, selectControl, status,
} from './ui.js';
import { fill, histogram, modeBadge } from './overview.js';

const vacancyStatuses = [
  ['active','Активные'], ['','Все статусы'], ['stale','Устаревшие'], ['archived','Архивные'],
];
const vacancySorts = [
  ['newest','Сначала новые'], ['match','По совпадению'], ['verified','По проверкам'], ['salary','По зарплате'],
];

function select(label, attribute, choices) {
  return `<label class="form-field"><span>${e(label)}</span>${selectControl(attribute,choices)}</label>`;
}

function marketFilters({ data, mode }) {
  const { region, format } = data.profile;
  return [
    select('Регион','data-setting="region"',options(data.regions,region)),
    select('Формат работы','data-setting="format"',options(data.formats,format)),
    select('Источник данных','data-market-mode',option('demo',mode,'Демонстрационные') + option('live',mode,'Реальные')),
  ].join('');
}

function sourceUnavailable() {
  return empty(
    'Источник вакансий недоступен',
    'Здесь появятся реальные вакансии после подключения источника. Сейчас можно посмотреть демонстрационные данные.',
    button('Показать демоданные','use-demo','primary'),
    'brief',
  );
}

function salaryPanel(market) {
  const { salary, source } = market;
  const reasons = [
    ['Вакансий с указанной зарплатой',salary.salary],
    ['Пригодных вилок',salary.eligible],
    ['Без зарплаты',salary.missing],
    ['Только одна граница вилки',salary.oneSided],
    ['Другой режим оплаты',salary.incompatible],
  ];
  const offers = market.jobs.filter(job => job.status === 'active' && job.salary).slice(0,5);
  const accounting = salary.tax === 'gross' ? 'до налогов' : 'на руки';
  const notEnough = salary.total > 0 && salary.salary === 0;
  return `<section class="market-salary">
    <h2>Зарплатные предложения</h2>
    ${salary.median == null ? notEnough
      ? callout('Работодатели не указали зарплаты','В этой выборке есть вакансии, но ни в одной нет опубликованной суммы.')
      : `<p class="market-salary-empty"><strong>Недостаточно данных</strong> Для расчёта нужна выборка из ${number(salary.minimum)} вилок. Сейчас их ${number(salary.eligible)}.</p>`
      : `<div class="market-number"><strong>${money(salary.median)}</strong><span>медиана середин вилок</span></div>
        <p>Половина середин вилок — в диапазоне <span class="market-range">${money(salary.lower)} — ${money(salary.upper)}</span>.</p>
        ${histogram(salary)}`}
    <p class="market-pay-meta">${e(salary.currency)} · в месяц · ${accounting} · ${number(salary.eligible)} вилок в расчёте</p>
    <details class="source-details">
      <summary>Из чего собрана выборка</summary>
      <dl class="sample-counts">${reasons.map(([label,value]) => `<div><dt>${label}</dt><dd>${number(value)}</dd></div>`).join('')}</dl>
      <p class="muted">${date(source.from)} — ${date(source.date)} · версия расчёта ${e(salary.version)}</p>
    </details>
    ${salary.median == null && offers.length ? `<details class="source-details">
      <summary>Посмотреть отдельные предложения</summary>
      <ul class="row-list offer-list">${offers.map(job => `<li class="list-row"><a href="#/vacancies/${e(job.id)}">${e(job.title)}</a><div><strong>${e(salaryText(job.salary))}</strong><small>${job.salary.tax === 'gross' ? 'до налогов' : 'на руки'}</small></div></li>`).join('')}</ul>
    </details>` : ''}
  </section>`;
}

function frequencyPanel(market) {
  const { active, requirements } = market;
  return `<section class="frequency-panel">
    <h2>Частые требования</h2>
    ${requirements.length ? `<ul class="frequency-list">${requirements.slice(0,8).map(item => `<li>
      <div><span>${e(item.skill)}</span><strong>${number(item.count)} <span>из ${number(active)}</span></strong></div>
      <span class="bar-track" aria-hidden="true">${fill(item.count / active * 100)}</span>
      </li>`).join('')}</ul>` : '<p class="muted">В выборке пока нет требований.</p>'}
    ${link('Смотреть вакансии','#/vacancies','quiet')}
  </section>`;
}

function comparison({ data, role, compareRole, compare, market }) {
  const other = data.roles.find(item => item.id === compareRole);
  const choices = option('',compareRole,'Выбрать роль') + data.roles.filter(item => item.id !== role.id).map(item => option(item.id,compareRole,item.name)).join('');
  const comparable = compare && ['currency','tax','period'].every(key => compare.salary[key] === market.salary[key]) && compare.source.mode === market.source.mode;
  const row = (name, result) => `<tr>
    <th scope="row">${e(name)}<small>${e(result.source.source)} · ${date(result.source.date)}</small></th>
    <td><strong>${result.salary.median == null || !comparable ? 'Недостаточно данных' : money(result.salary.median)}</strong>
      <small>${number(result.active)} активных · ${number(result.salary.eligible)} вилок в расчёте</small></td>
  </tr>`;
  return `<section class="comparison">
    <header class="section-head"><div><h2>Сравнить роли</h2><p>Регион, формат и режим данных одинаковы для обеих ролей.</p></div>${select('Вторая роль','data-compare-role',choices)}</header>
    ${other && compare ? `<table class="market-comparison">
      <thead><tr><th scope="col">Роль и источник</th><th scope="col">Медиана середин вилок</th></tr></thead>
      <tbody>${row(role.name,market)}${row(other.name,compare)}</tbody>
    </table>` : ''}
    ${other && compare && !comparable ? callout('Выборки несопоставимы','Для сравнения нужны одинаковые валюта, налоговый режим и период оплаты.') : ''}
  </section>`;
}

export function marketPage(state) {
  const { market, role } = state;
  if (!role) return empty('Выбери роль','Покажем вакансии и предложения зарплат по твоей роли.',link('Каталог ролей','#/roles','primary'),'chart');
  const { active, stale, archived, source, status: marketStatus } = market;
  const { region,format } = state.data.profile;
  return `<div class="market-page">
    ${heading('Обзор рынка',role.name,link('Сменить роль','#/roles','quiet'))}
    <details class="market-filter-disclosure filter-disclosure" data-filter-group="market"${state.marketFiltersOpen ? ' open' : ''}>
      <summary>Условия выборки <span>${e(region)} · ${e(format)}</span></summary>
      <div class="filters market-filters">${marketFilters(state)}</div>
    </details>
    ${marketStatus === 'source-unavailable' ? sourceUnavailable() : `
      ${marketStatus === 'empty' ? empty('Активных вакансий нет','В этом регионе и формате выборка пуста. Измени условия поиска.',link('Открыть вакансии','#/vacancies','quiet')) : `<div class="market-insights">${salaryPanel(market)}${frequencyPanel(market)}</div>`}
      <footer class="market-snapshot">
        <p><strong>${source.mode === 'demo' ? 'Демонстрационные данные' : 'Реальные данные'}</strong> · ${e(source.source)} · обновлено ${date(source.date)}</p>
        <p>Активных: <strong>${number(active)}</strong> · устаревших: <strong>${number(stale)}</strong> · архивных: <strong>${number(archived)}</strong></p>
      </footer>
      ${comparison(state)}`}
  </div>`;
}

function filteredJobs(jobs, filters) {
  const query = filters.search.toLocaleLowerCase('ru').trim();
  const matches = jobs.filter(job =>
    (!filters.status || job.status === filters.status) &&
    (!filters.level || job.level === filters.level) &&
    (!query || [job.title,job.company,job.region,job.format].some(value => value?.toLocaleLowerCase('ru').includes(query))));
  const published = (a,b) => (b.published ?? '').localeCompare(a.published ?? '');
  const salaryValue = job => job.salary?.min ?? job.salary?.max ?? -1;
  const ranking = {
    newest:published, match:(a,b) => (b.match.profile ?? -1) - (a.match.profile ?? -1),
    verified:(a,b) => (b.match.verified ?? -1) - (a.match.verified ?? -1),
    salary:(a,b) => salaryValue(b) - salaryValue(a),
  };
  return matches.sort((a,b) => (ranking[filters.sort] ?? published)(a,b) || published(a,b));
}

export function vacancyResults({ market, vacancyFilters }) {
  if (market.status === 'source-unavailable') return `<div class="card">${sourceUnavailable()}</div>`;
  const jobs = filteredJobs(market.jobs,vacancyFilters);
  const source = market.source;
  const modeLabel = source.mode === 'demo' ? 'Демо' : 'Реальные данные';
  const metrics = `<div class="vacancy-results-head"><strong role="status">Найдено: ${number(jobs.length)}</strong>
    <p><span class="vacancy-source-mode">${modeLabel}</span> · ${e(source.source)} · обновлено ${date(source.date)}</p></div>`;
  if (!jobs.length) {
    return metrics + `<div class="card">${empty('Вакансии не найдены','Измени поисковый запрос или условия. Регион и формат можно изменить в фильтрах.',button('Сбросить фильтры списка','reset-vacancy-filters'))}</div>`;
  }
  return metrics + `<div class="vacancy-board card">
    <div class="vacancy-column-head vacancy-columns" aria-hidden="true">
      <span>Вакансия</span><span>Зарплата</span><span>По профилю</span><span>Проверено</span>
    </div>
    <ol class="vacancy-list" role="list" aria-label="Найденные вакансии">${jobs.map(job => vacancyRow(job,source,vacancyFilters.status)).join('')}</ol>
  </div>`;
}

function vacancyRow(job, source, selectedStatus) {
  const titleId = `vacancy-title-${job.id}`;
  const state = !selectedStatus || job.status !== 'active';
  const conditions = [job.company,job.region,job.format,job.level].filter(Boolean).map(e).join(' · ');
  const payPeriod = job.salary?.period === 'month' ? 'в месяц' : 'период источника';
  const tax = job.salary?.tax === 'gross' ? 'до налогов' : 'на руки';
  const gaps = job.match.gaps.map(e).join(', ');
  const unknown = job.match.unknown.map(e).join(', ');
  return `<li class="vacancy-list-item">
    <a class="vacancy-row vacancy-columns" href="#/vacancies/${e(job.id)}" aria-labelledby="${e(titleId)}">
      <div class="vacancy-row-identity">
        <h2 id="${e(titleId)}">${e(job.title)}</h2>
        <p>${conditions}</p>
        ${state || job.mode !== source.mode ? `<div class="vacancy-row-states">${state ? badge(...status(job.status)) : ''}${job.mode !== source.mode ? modeBadge(job.mode) : ''}</div>` : ''}
      </div>
      <div class="vacancy-row-pay"><span class="vacancy-row-label">Зарплата</span><strong>${e(job.salary ? salaryText(job.salary) : 'Не указана')}</strong>
        ${job.salary ? `<small>${payPeriod} · ${tax}</small>` : ''}</div>
      <div class="vacancy-row-score"><span class="vacancy-row-label">По профилю</span><strong>${percent(job.match.profile)}</strong></div>
      <div class="vacancy-row-score"><span class="vacancy-row-label">Проверено</span><strong>${percent(job.match.verified)}</strong></div>
      ${gaps || unknown ? `<div class="vacancy-row-notes">${gaps ? `<span class="vacancy-gaps"><b>Пробелы:</b> ${gaps}</span>` : ''}
        ${unknown ? `<span><b>Неизвестно:</b> ${unknown}</span>` : ''}</div>` : ''}
      <small class="vacancy-row-dates">${job.source !== source.source ? `${e(job.source)} · ` : ''}Опубликована ${date(job.published)} · Получена ${date(job.fetched)}</small>
    </a>
  </li>`;
}

export function vacanciesPage(state) {
  const { role, data, vacancyFilters:filters } = state;
  if (!role) return empty('Выбери роль','Каталог вакансий подстраивается под специализацию.',link('Каталог ролей','#/roles','primary'),'brief');
  const filterContext = `${data.profile.region} · ${data.profile.format}`;
  return `<div class="vacancies-page">
    ${heading('Вакансии',role.name,link('Сменить роль','#/roles','quiet'))}
    <section class="vacancy-filter-panel" aria-label="Фильтры вакансий">
      <div class="vacancy-query">
        <label class="form-field vacancy-search"><span>Поиск по вакансиям</span><span class="input-icon">${icon('search',18)}<input type="search" data-vacancy-filter="search" value="${e(filters.search)}" placeholder="Должность, компания" autocomplete="off"></span></label>
        ${select('Сортировка','data-vacancy-filter="sort"',vacancySorts.map(([id,name]) => option(id,filters.sort,name)).join(''))}
      </div>
      <details class="vacancy-more-filters filter-disclosure" data-filter-group="vacancy"${state.vacancyFiltersOpen ? ' open' : ''}>
        <summary>Фильтры <span class="vacancy-filter-context">${e(filterContext)}</span></summary>
        <div class="vacancy-extra-fields">
          ${select('Уровень','data-vacancy-filter="level"',option('',filters.level,'Любой уровень') + options(data.levels,filters.level))}
          ${select('Статус','data-vacancy-filter="status"',vacancyStatuses.map(([id,name]) => option(id,filters.status,name)).join(''))}
          ${marketFilters(state)}
        </div>
      </details>
    </section>
    <div id="vacancy-results">${vacancyResults(state)}</div>
  </div>`;
}

function reportScore(label, value, description, tone) {
  return `<div class="report-score">
    <dt>${label}</dt><dd><strong>${percent(value)}</strong><p>${description}</p>
    ${value == null ? '' : `<span class="bar-track" aria-hidden="true">${fill(value,tone)}</span>`}</dd>
  </div>`;
}

function condition(label, value, result) {
  const [text, tone] = result;
  return `<div><dt>${label}</dt><dd><strong>${e(value)}</strong><span class="report-condition ${tone}">${text}</span></dd></div>`;
}

function workplace(job, { data }) {
  const { region, format } = data.profile;
  const compare = (own,actual,defaultValue) => !own || !actual
    ? ['Неизвестно','neutral'] : own === defaultValue || own === actual ? ['Подходит','mint'] : ['Не совпадает','amber'];
  return `<section class="report-context-section">
    <h2>Условия вакансии</h2>
    <dl class="report-facts">
      ${condition('Местоположение',job.region,job.format === 'Удалённо' ? ['Неизвестно','neutral'] : compare(region,job.region,data.regions[0]))}
      ${condition('Формат работы',job.format,compare(format,job.format,data.formats[0]))}
      ${condition('Язык',job.language ?? 'Не указан',['Неизвестно','neutral'])}
      ${condition('Разрешение на работу',job.authorization ?? 'Не указано',['Неизвестно','neutral'])}
    </dl>
    ${link('Изменить условия поиска','#/roles','quiet')}
  </section>`;
}

function requirement(row, state, job) {
  const hasOutcome = row.checked.length > 0;
  const check = state.data.checks.find(item => item.roleId === job.roleId && item.skillId === row.id && item.topic === row.topic);
  const checkPath = check ? `#/checks/start/${check.id}?${new URLSearchParams({ return:`#/vacancies/${job.id}` })}` : '';
  const assessment = [
    row.declared && 'Заявлено',
    hasOutcome && (row.verified > 0 ? 'Есть проверенная часть' : 'Пока не подтверждено'),
  ].filter(Boolean).join(' · ') || 'Неизвестно';
  return `<li class="report-requirement">
    <div class="report-requirement-title"><h3>${e(row.skill)}</h3><span>${row.mandatory ? 'Обязательно' : 'Желательно'}</span></div>
    <div class="report-requirement-proof">
      <strong class="${row.verified > 0 ? 'has-evidence' : ''}">${assessment}</strong>
      ${hasOutcome ? `<ul class="report-evidence">${row.checked.map(item => `<li>${e(item.scope)} · ${number(item.correct)}/${number(item.total)} <small>${date(item.date)} · ${e(item.source)} · ${e(item.version)}</small></li>`).join('')}</ul>` : ''}
      <details class="source-details"><summary>Исходный фрагмент</summary><blockquote>${e(row.text)}</blockquote><p>${e(job.source)} · снимок ${e(job.snapshotVersion)}</p></details>
      ${check && row.checkedShare < 1 && state.role?.id === job.roleId ? link('Пройти проверку',checkPath,'quiet') : ''}
    </div>
  </li>`;
}

function citedExplanation(explanation) {
  if (explanation?.state === 'loading') return '<p class="muted" role="status">Загружаем объяснение…</p>';
  if (!explanation || explanation.state === 'unavailable') {
    return callout('Текстовое объяснение недоступно','Оценка и исходные фрагменты требований доступны на этой странице.');
  }
  const sources = new Map((explanation.sources ?? []).map(source => [source.id,source]));
  const sections = explanation.state === 'ready' ? (explanation.sections ?? []).filter(section =>
    section.text && section.citationIds?.length && section.citationIds.every(id => sources.has(id))) : [];
  if (!sections.length) return callout('Недостаточно данных','В доступных материалах не нашлось достаточного основания для объяснения.');
  return `<div class="report-explanations">${sections.map(section => `<article>
    <p>${e(section.text)}</p>
    <details class="source-details"><summary>Источники вывода</summary><ul class="explanation-sources">
      ${section.citationIds.map(id => {
        const source = sources.get(id);
        const url = safeUrl(source.url);
        return `<li><strong>${e(source.title)}</strong>${source.version ? ` <small>${e(source.version)}</small>` : ''}
          ${source.fragment ? `<blockquote>${e(source.fragment)}</blockquote>` : ''}
          ${url ? link('Открыть источник',url,'quiet') : ''}</li>`;
      }).join('')}
    </ul></details>
  </article>`).join('')}</div>`;
}

export function vacancyPage(state) {
  const { job } = state;
  const { match } = job;
  const sourceUrl = safeUrl(job.url);
  const vacancyMode = job.mode === 'live' ? 'Реальная вакансия' : 'Демо-вакансия';
  const profileAction = state.role?.id === job.roleId
    ? link('Открыть карту навыков','#/skills','quiet')
    : link('Выбрать роль','#/roles','quiet');
  return `<article class="vacancy-report">
    ${back('Все вакансии','#/vacancies')}
    <header class="report-heading">
      <div class="report-identity">
        <p class="report-kicker">${vacancyMode}<span> · ${status(job.status)[0]}</span></p>
        <h1>${e(job.title)}</h1>
        <p class="report-meta"><strong>${e(job.company)}</strong>${job.level ? ` · ${e(job.level)}` : ''} · ${e(job.region)} · ${e(job.format)}</p>
      </div>
      <div class="report-offer">
        <strong>${e(salaryText(job.salary))}</strong>
        ${job.salary ? `<small>${job.salary.period === 'month' ? 'в месяц' : 'период источника'} · ${job.salary.tax === 'gross' ? 'до налогов' : 'на руки'}</small>` : ''}
        ${link('Подготовить письмо',`#/vacancies/${job.id}/letter`,'secondary')}
      </div>
    </header>
    ${job.status === 'stale' ? callout('Данные могли устареть','Сведения об этой вакансии получены из предыдущего снимка.','amber','warning') : ''}
    <section class="report-match" aria-labelledby="vacancy-match">
      <h2 id="vacancy-match">Совпадение с требованиями</h2>
      ${match.profile == null ? `<div class="report-missing"><div><strong>Недостаточно данных о навыках</strong><p>Добавь навыки для этой роли или пройди проверку.</p></div>${profileAction}</div>` : ''}
      <div class="report-match-panel">
        <dl class="report-scores">
          ${reportScore('По профилю',match.profile,'Заявлено и проверено','mint')}
          ${reportScore('Проверено',match.verified,'По темам проверок','lilac')}
        </dl>
        <div class="report-match-notes">
          ${match.gaps.length ? `<p class="report-gap"><strong>Пробелы в обязательных навыках</strong><span>${e(match.gaps.join(', '))}</span></p>` : ''}
          ${match.unknown.length ? `<p class="report-unknown">Неизвестно: ${e(match.unknown.join(', '))}</p>` : ''}
          <p class="report-version">Версия расчёта ${e(match.version)}</p>
        </div>
      </div>
    </section>
    <div class="report-content">
      <div class="report-findings">
        <section>
          <h2>Требования к навыкам</h2>
          ${match.rows.length ? `<ul class="report-requirements">${match.rows.map(row => requirement(row,state,job)).join('')}</ul>` : '<p>Требования к навыкам пока не выделены.</p>'}
        </section>
        <section class="report-why">
          <div class="report-subhead"><h2>Почему такой результат</h2>${job.explanation?.mode === 'demo' ? '<small>Демо-разбор</small>' : ''}</div>
          ${citedExplanation(job.explanation)}
        </section>
      </div>
      <aside class="report-context" aria-label="Сведения о вакансии">
        ${workplace(job,state)}
        <section class="report-context-section">
          <h2>О вакансии</h2>
          <p>${e(job.summary)}</p>
          <dl class="report-facts">
            <div><dt>Источник</dt><dd>${e(job.source)}</dd></div>
            <div><dt>Опубликовано</dt><dd>${date(job.published)}</dd></div>
            <div><dt>Получено</dt><dd>${date(job.fetched)}</dd></div>
            <div><dt>Версия снимка</dt><dd>${e(job.snapshotVersion)}</dd></div>
          </dl>
          ${sourceUrl ? link('Открыть оригинал',sourceUrl,'quiet') : ''}
        </section>
      </aside>
    </div>
  </article>`;
}

export function letterFacts({ data, role, job }) {
  if (role?.id !== job.roleId) return [];
  const { claims, evidence } = data.profile;
  return [
    ...role.skillIds.filter(id => Number.isInteger(claims[id])).map(id => ({
      id:`claim:${id}`, title:data.skills[id].name, detail:data.experience[claims[id]], type:'Заявлено', tone:'blue',
    })),
    ...evidence.filter(item => item.correct > 0).map(item => ({
      id:`evidence:${item.id}`, title:item.scope, detail:`${item.correct} из ${item.total} правильных ответов`, type:'Проверенная тема', tone:'mint',
    })),
  ];
}

export function letterPage(state) {
  const { job, letterText, selectedFacts = [] } = state;
  const facts = letterFacts(state);
  const groups = [
    { title:'Заявленный опыт', items:facts.filter(fact => fact.id.startsWith('claim:')) },
    { title:'Проверенные темы', items:facts.filter(fact => fact.id.startsWith('evidence:')) },
  ];
  return `<div class="letter-page">
    ${back('К вакансии',`#/vacancies/${job.id}`)}
    ${heading('Письмо работодателю',`${job.title} · ${job.company}${job.mode === 'demo' ? ' · Демовакансия' : ''}`)}
    <div class="letter-grid">
      <section class="letter-section" aria-labelledby="letter-facts-title">
        <h2 id="letter-facts-title">Что включить в письмо</h2>
        ${facts.length ? `<p>Выбери подходящий опыт и результаты проверок.</p>${groups.filter(group => group.items.length).map(group => `
          <fieldset class="letter-fact-group"><legend>${group.title}</legend>${group.items.map(fact => `
            <label class="letter-choice">
              <input type="checkbox" data-letter-fact value="${e(fact.id)}"${selectedFacts.includes(fact.id) ? ' checked' : ''}>
              <span><strong>${e(fact.title)}</strong><small>${e(fact.detail)}</small></span>
            </label>`).join('')}</fieldset>`).join('')}` : '<p>Для этой роли в профиле нет фактов. Можно собрать базовое письмо.</p>'}
        <div class="letter-actions">${button(letterText == null ? 'Создать черновик' : 'Обновить черновик','generate-letter','primary')}</div>
      </section>
      <section class="letter-section letter-writing" aria-labelledby="letter-text-title">
        <h2 id="letter-text-title"><label for="letter-text">Текст письма</label></h2>
        <p id="letter-text-hint">Проверь и отредактируй черновик перед копированием.</p>
        <textarea id="letter-text" data-letter-text rows="11" aria-describedby="letter-text-hint" placeholder="Здесь появится черновик. Можно также написать письмо самостоятельно.">${e(letterText)}</textarea>
        <div class="letter-actions">${button('Скопировать письмо','copy-letter')}</div>
      </section>
    </div>
  </div>`;
}
