import { back, badge, button, callout, date, empty, escape as e, heading, icon, link, option, options, selectControl } from './ui.js';

const conditionFields = ({ profile, regions, formats }) => `
  <label class="form-field"><span>Регион</span>${selectControl('name="region" data-action="profile-filter"',options(regions,profile.region))}</label>
  <label class="form-field"><span>Формат работы</span>${selectControl('name="format" data-action="profile-filter"',options(formats,profile.format))}</label>`;

const needRole = (title, description) => heading(title,description) + empty('Сначала выбери роль','Каталог и проверки зависят от специальности.',link('Выбрать роль','#/roles','primary'),'layers');
const directionOf = (data, role) => data.directions.find(direction => direction.id === role.direction);
const currentChecks = ({ data, role }) => data.checks.filter(check => check.roleId === role?.id);
const checkHref = id => `#/checks/start/${id}`;
const attemptHref = id => `#/checks/attempt/${id}`;
const matchSearch = (query, values) => {
  const normalize = value => value.toLocaleLowerCase('ru-RU').replaceAll('ё','е');
  const terms = normalize(query.trim()).split(/\s+/);
  const text = normalize(values.join(' '));
  return terms.every(term => text.includes(term));
};
const chip = (label, action, value, chosen) => `
  <button type="button" class="chip${chosen ? ' selected' : ''}" data-action="${action}" data-value="${e(value)}" aria-pressed="${chosen}">
    ${e(label)}
  </button>`;
const searchField = (action, value, label) => `
  <label class="search-field">
    <span class="sr-only">${e(label)}</span>${icon('search',18)}
    <input type="search" placeholder="${e(label)}" data-action="${action}" value="${e(value)}" autocomplete="off">
  </label>`;

export function renderRoleList(state) {
  const { data, role, direction = 'all', roleSearch = '' } = state;
  const visible = data.roles.filter(item => (direction === 'all' || item.direction === direction)
    && matchSearch(roleSearch,[item.name,item.description,directionOf(data,item)?.name ?? '']));
  if (!visible.length) return `<p class="roles-empty">Роли не найдены. Измени запрос или выбери другое направление.</p>`;
  return `<ul class="roles-list" role="list">${visible.map(item => {
    const category = directionOf(data,item);
    const checkCount = data.checks.filter(check => check.roleId === item.id).length;
    const selected = item.id === role?.id;
    return `<li class="role-card${selected ? ' is-current' : ''}">
      <div class="role-title">
        <p class="role-meta">${e(category?.name)}${selected ? '<span>Текущая роль</span>' : ''}</p>
        <h2>${e(item.name)}</h2>
        <p class="role-description">${e(item.description)}</p>
      </div>
      <dl class="role-coverage">
        <div><dt>Навыки</dt><dd>${item.skillIds.length ? `${e(item.catalog ?? 'Каталог')} · ${item.skillIds.length}` : 'Нет каталога'}</dd></div>
        <div><dt>Критерии</dt><dd>${item.criteria ? data.snapshot.mode === 'demo' ? 'Демо-матрица' : 'Опубликованы' : 'Готовятся'}</dd></div>
        <div><dt>Проверки</dt><dd>${checkCount ? `Доступно: ${checkCount}` : 'Готовятся'}</dd></div>
      </dl>
      ${selected ? link('Открыть карту','#/skills','primary') : button('Выбрать роль','choose-role','secondary',item.id)}
    </li>`;
  }).join('')}</ul>`;
}

export function rolesPage(state) {
  const { data, roleSearch = '', direction = 'all' } = state;
  return `<div class="roles-page">
    ${heading('Роль и условия','От выбранной роли зависят карта навыков, доступные проверки и вакансии.')}
    <div class="roles-tools">
      ${searchField('role-search',roleSearch,'Поиск по ролям')}
      <label class="form-field"><span>Направление IT</span>${selectControl('data-role-direction',option('all',direction,'Все направления') + data.directions.map(item => option(item.id,direction,item.name)).join(''))}</label>
    </div>
    <div class="roles-layout">
      <details class="roles-conditions filter-disclosure" data-filter-group="roles"${state.roleFiltersOpen ? ' open' : ''}>
        <summary>Условия поиска</summary>
        <div class="roles-condition-fields">${conditionFields(data)}</div>
      </details>
      <div id="role-list" aria-live="polite">${renderRoleList(state)}</div>
    </div>
  </div>`;
}

const getEvidence = (profile, skillId) => profile.evidence.filter(item => item.skillId === skillId);
const claimOf = (profile,id) => Number.isInteger(profile.claims[id]) ? profile.claims[id] : null;

export function renderSkillList(state) {
  const { data, role, skillView = 'all', skillSearch = '' } = state;
  const profile = data.profile;
  const checks = currentChecks(state);
  const groups = new Map();
  for (const skillId of role?.skillIds ?? []) {
    const skill = data.skills[skillId];
    if (!skill || !matchSearch(skillSearch,[skill.name,...skill.aliases])) continue;
    const claim = claimOf(profile,skill.id);
    const evidence = getEvidence(profile,skill.id);
    if (skillView === 'claimed' && claim === null) continue;
    if (skillView === 'checked' && !evidence.some(item => item.correct > 0)) continue;
    if (!groups.has(skill.group)) groups.set(skill.group,[]);
    groups.get(skill.group).push({ ...skill, claim, evidence });
  }
  if (!groups.size) return empty('Навыки не найдены',skillSearch ? 'Попробуй другое название или синоним.' : 'Здесь появятся навыки с подходящим статусом.','','search');
  return [...groups].map(([group,items]) => `<section class="skill-group">
    <h2>${e(group)}</h2>
    <ul class="row-list skill-rows">${items.map(skill => {
      const check = checks.find(item => item.skillId === skill.id);
      const confirmed = skill.evidence.findLast(item => item.correct > 0);
      const latest = skill.evidence.at(-1);
      const experienceOptions = data.experience.map((label,rank) => option(String(rank),skill.claim === null ? '' : String(skill.claim),label));
      return `<li class="list-row skill-row">
        <div class="skill-details">
          <strong>${e(skill.name)}</strong><p>${e(skill.description)}</p>
          ${confirmed ? `<a class="text-link" href="${attemptHref(confirmed.id)}">Результат проверки: ${e(confirmed.scope)} · ${confirmed.correct} из ${confirmed.total}</a>`
            : latest ? '<p class="skill-evidence">Тема не подтверждена</p>' : ''}
        </div>
        <div class="skill-controls">
          <label class="form-field"><span class="sr-only">Опыт с навыком ${e(skill.name)}</span>
            ${selectControl(`data-action="save-claim" data-value="${e(skill.id)}"`,option('',skill.claim === null ? '' : null,'Не указано') + experienceOptions.join(''))}
          </label>
          ${check ? link('К проверке',checkHref(check.id) + '?return=' + encodeURIComponent('#/skills'),'quiet') : ''}
        </div>
      </li>`;
    }).join('')}</ul>
  </section>`).join('');
}

export function skillsPage(state) {
  const { data, role, skillView = 'all', skillSearch = '' } = state;
  if (!role) return needRole('Карта навыков','Добавь знакомые навыки и отметь, где ты их применял.');
  const declared = role.skillIds.filter(id => claimOf(data.profile,id) !== null).length;
  const verified = new Set(data.profile.evidence.filter(item => item.correct > 0 && role.skillIds.includes(item.skillId)).map(item => item.skillId)).size;
  return `<div class="skills-page">
    ${heading('Карта навыков',`${role.name} · Укажи свой опыт по каждому навыку.`)}
    <div class="skill-summary">
      <p><strong>${declared} из ${role.skillIds.length}</strong> навыков заявлено <span aria-hidden="true">·</span> <strong>${verified}</strong> с проверенной темой</p>
      <div class="actions">${link('Проверки навыков','#/checks','quiet')}${link('Критерии уровней','#/levels','quiet')}</div>
    </div>
    <div class="skill-toolbar">
          ${searchField('skill-search',skillSearch,'Поиск по навыкам')}
          <div class="chips" role="group" aria-label="Фильтр карты навыков">
            ${chip('Все навыки','skill-view','all',skillView === 'all')}
            ${chip('Заявленные','skill-view','claimed',skillView === 'claimed')}
            ${chip('С проверкой','skill-view','checked',skillView === 'checked')}
          </div>
    </div>
    <div id="skill-list" class="stack" aria-live="polite">${renderSkillList(state)}</div>
  </div>`;
}

export function levelsPage(state) {
  const { data, role, criteria = [], level } = state;
  if (!role) return needRole('Критерии уровней','Требования к знаниям и ответственности зависят от роли.');
  const chosen = data.levels.includes(level) ? level : 'Middle';
  const criterion = criteria.find(item => item.level === chosen);
  const criterionSkill = data.skills[criterion?.topic];
  const claim = criterionSkill ? claimOf(data.profile,criterionSkill.id) : null;
  const evidence = criterionSkill ? getEvidence(data.profile,criterionSkill.id) : [];
  return `${heading('Критерии уровней',role.name,link('Карта навыков','#/skills','secondary'))}
    <div class="stack levels-content">
      <div class="chips" role="group" aria-label="Уровень роли">${data.levels.map(item => chip(item,'choose-level',item,item === chosen)).join('')}</div>
      ${criterion ? `
        <section class="levels-criteria">
          <header class="section-head">
            <div><h2>Что ожидают на уровне ${e(chosen)}</h2><p>${e(criterion.source)} · версия ${e(criterion.version)} · ${date(criterion.date)}</p></div>
          </header>
          <ul class="row-list">
            ${criterion.content.map(({ dimension,text },index) => `<li class="list-row rubric-row">
              <strong>${e(dimension)}</strong><p>${e(text)}</p>
              <span class="${index === 1 && claim !== null ? 'text-link' : 'muted'}">${index === 1 && claim !== null ? 'Опыт заявлен' : 'Нет данных об опыте'}</span>
            </li>`).join('')}
          </ul>
        </section>
        <section>
          <header class="section-head"><div><h2>Что есть в твоём профиле</h2></div></header>
          <ul class="row-list">
            ${criterionSkill ? `<li class="list-row"><div><strong>${e(criterionSkill.name)}</strong><p>${claim === null ? 'Опыт не указан' : e(data.experience[claim])}</p></div>${claim === null ? badge('Неизвестно') : badge('Заявлено','lilac')}</li>` : ''}
            ${evidence.map(item => `<li class="list-row"><div><strong>${e(item.scope)}</strong><p>${item.correct} из ${item.total} · ${date(item.date)}</p></div>${link('К результату',attemptHref(item.id),'quiet')}</li>`).join('')}
          </ul>
        </section>` : empty('Недостаточно данных','Для этого уровня пока нет опубликованного критерия. Карта навыков и рынок по роли доступны.',link('Открыть рынок','#/market','secondary'),'target')}
      ${callout(chosen === 'Lead' || chosen === 'Senior' ? 'Практика и ответственность требуют отдельных свидетельств' : 'Как читать критерии','Таблица описывает ожидания к роли. Короткий квиз подтверждает знание конкретной темы.')}
    </div>`;
}

const checkMeta = (check, mode) => `<p class="check-meta">${check.count ?? check.questions?.length} вопр. · около ${check.minutes} мин${mode === 'demo' ? ' · Демо' : ''}</p>`;
const checkBack = href => back(href === '#/skills' ? 'К карте навыков' : href.startsWith('#/vacancies/') ? 'К вакансии' : 'К проверкам',href);

function quizIntro(state, check) {
  const inProgress = state.data.profile.attempts.find(item => item.checkId === check.id && !item.complete);
  const returnTo = state.returnTo ?? '#/checks';
  return `${checkBack(returnTo)}
    ${heading(check.title,state.role.name)}
    <div class="stack quiz-shell">
      <section class="card pane quiz-card">
        ${checkMeta(check,state.data.snapshot.mode)}
        <h2>${e(check.scope)}</h2>
        <p>В каждом вопросе один вариант ответа. Можно выбрать «Не знаю» и двигаться дальше.</p>
        ${callout('Что остаётся за рамками',check.limit)}
        <div class="actions">${button(inProgress ? 'Продолжить' : 'Начать проверку','start-check','primary',check.id)}</div>
        <p class="muted note">${e(check.source)} · ${e(check.version)}</p>
      </section>
    </div>`;
}

export function checksPage(state) {
  const { data, role, checkId } = state;
  if (!role) return needRole('Короткие проверки','Пройди квиз по конкретной теме и посмотри результат.');
  const checks = currentChecks(state);
  const unfinished = data.profile.attempts.filter(item => !item.complete && !checks.some(check => check.id === item.checkId));
  if (checkId) {
    const check = checks.find(item => item.id === checkId);
    if (check) return quizIntro(state,check);
    const pending = unfinished.find(item => item.checkId === checkId);
    if (pending) return heading(pending.title,pending.scope)
      + empty('Есть начатая попытка','Можно закончить проверку по версии, с которой ты начал.',link('Продолжить',attemptHref(pending.id),'primary'),'shield');
    return heading('Проверка недоступна',role.name)
      + empty('Тема отсутствует в каталоге роли','Выбери другую проверку или измени роль.',link('К проверкам','#/checks','secondary'),'shield');
  }
  return `${heading('Короткие проверки','Проверь знание конкретной темы и добавь результат в профиль.')}
    <div class="stack checks-content">
      ${checks.length ? `<section aria-label="Доступные темы" class="check-list">${checks.map(check => {
        const inProgress = data.profile.attempts.find(item => item.checkId === check.id && !item.complete);
        return `<article class="check-list-row">
          <div><h2>${e(check.title)}</h2><p>${e(check.scope)}</p>${checkMeta(check,data.snapshot.mode)}</div>
          ${inProgress ? link('Продолжить',attemptHref(inProgress.id),'primary') : link('Открыть проверку',checkHref(check.id),'secondary')}
        </article>`;
      }).join('')}</section>` : empty('Проверки готовятся','Для этой роли пока нет опубликованных квизов.',link('Открыть карту','#/skills','secondary'),'shield')}
      ${unfinished.length ? `<section>
        <header class="section-head"><div><h2>Начатые проверки</h2><p>Можно завершить попытку по исходной версии вопросов.</p></div></header>
        <ul class="row-list">${unfinished.map(item => `<li class="list-row check-history">
          <div><strong>${e(item.title)}</strong><p>${e(item.scope)}</p></div>
          ${link('Продолжить',attemptHref(item.id),'primary')}
        </li>`).join('')}</ul>
      </section>` : ''}
      ${data.profile.evidence.length ? `<section>
        <header class="section-head"><div><h2>История проверок</h2><p>Результаты для выбранной роли.</p></div></header>
        <ul class="row-list">${[...data.profile.evidence].reverse().map(item => `<li class="list-row check-history">
          <div><strong>${e(item.title)}</strong><p>${e(item.scope)} · ${date(item.date)}</p></div>
          ${badge(`${item.correct} из ${item.total}`,item.correct > 0 ? 'mint' : 'neutral')}
          ${link('Посмотреть',attemptHref(item.id),'quiet')}
        </li>`).join('')}</ul>
      </section>` : ''}
    </div>`;
}

function resultPage(attempt, checks) {
  const { result } = attempt;
  const areaLabels = { correct:['Верно','mint','check'], incorrect:['Ошибка','amber','x'], unknown:['Не знаю','neutral'] };
  const returnTo = attempt.returnTo ?? '#/checks';
  const returnLabel = returnTo.startsWith('#/vacancies/') ? 'Вернуться к вакансии' : returnTo === '#/skills' ? 'Вернуться к карте' : 'К списку проверок';
  const retryHref = returnTo === '#/checks' ? checkHref(attempt.checkId) : `${checkHref(attempt.checkId)}?${new URLSearchParams({ return:returnTo })}`;
  return `${back('К проверкам','#/checks')}${heading('Результат проверки',attempt.title)}
    <div class="stack quiz-shell">
      <section class="card pane quiz-card">
        <div class="quiz-result">
          <div><strong>${result.correct} из ${result.total}</strong><p>Верных ответов · ${date(result.date)}</p></div>
        </div>
        <h2>${e(attempt.scope)}</h2>
        <ul class="row-list">${result.areas.map(area => `<li class="list-row"><strong>${e(area.name)}</strong>${badge(...(areaLabels[area.status] ?? ['На проверке','amber']))}</li>`).join('')}</ul>
        ${callout('Что остаётся за рамками',attempt.limit)}
        <p class="muted note">${e(attempt.source)} · ${e(attempt.version)}</p>
        <div class="actions">${link(returnLabel,returnTo,'primary')}${checks.some(item => item.id === attempt.checkId) ? link('Пройти ещё раз',retryHref,'secondary') : ''}</div>
      </section>
    </div>`;
}

export function attemptPage(state) {
  const { attempt } = state;
  if (!attempt) return empty('Попытка недоступна','Открой проверку из списка доступных тем.',link('К проверкам','#/checks','secondary'),'shield');
  if (attempt.result) return resultPage(attempt,currentChecks(state));
  const { questions, answers } = attempt;
  const unanswered = questions.findIndex((_,index) => !Object.hasOwn(answers,index));
  const index = state.question ?? (unanswered < 0 ? questions.length - 1 : unanswered);
  const question = questions[index];
  if (!question) return empty('Вопрос недоступен','Открой список проверок и попробуй снова.',link('К проверкам','#/checks','secondary'),'shield');
  const completed = Object.keys(answers).length;
  return `${checkBack(state.returnTo ?? '#/checks')}${heading(attempt.title,attempt.scope)}
    <div class="quiz-shell">
      <section class="card pane quiz-card">
        <header class="section-head"><strong>Вопрос ${index + 1} из ${questions.length}</strong><span class="muted">Ответов: ${completed} из ${questions.length}</span></header>
        <progress class="quiz-progress" aria-label="Сохранено ответов" value="${completed}" max="${questions.length}"></progress>
        <form data-action="quiz-answer" data-index="${index}">
          <fieldset class="quiz-options">
            <legend>${e(question.text)}</legend>
            ${question.options.map((label,optionIndex) => `<label class="quiz-option">
              <input type="radio" name="option" value="${optionIndex}" required${answers[index] === optionIndex ? ' checked' : ''}>
              <span>${e(label)}</span>
            </label>`).join('')}
          </fieldset>
          <div class="actions">
            ${index > 0 ? button('Назад','quiz-question','secondary',String(index - 1)) : ''}
            <button class="button primary" type="submit">${index === questions.length - 1 ? 'Завершить' : 'Дальше'}</button>
          </div>
        </form>
        <p class="muted note">Ответы сохраняются после перехода к следующему вопросу.</p>
      </section>
    </div>`;
}

export function profilePage({ data,role }) {
  const { profile } = data;
  const demo = data.snapshot.mode === 'demo';
  return `${heading('Профиль и данные',role?.name ?? 'Роль не выбрана')}
    <div class="profile-settings">
      <section class="settings-section">
        <div><h2>Условия поиска</h2><p>Влияют на вакансии и зарплаты в обзоре рынка.</p></div>
        <div>
          <div class="filters">${conditionFields(data)}</div>
          ${link(role ? 'Сменить роль' : 'Выбрать роль','#/roles','quiet')}
        </div>
      </section>
      <section class="settings-section">
        <div><h2>Сохранённые данные</h2>${demo ? '<p>Данные демо-профиля хранятся до перезапуска локального сервера.</p>' : ''}</div>
        <dl class="settings-data">
          <div><dt>Отметки опыта <small>По всем ролям</small></dt><dd>${Object.keys(profile.claims).length}</dd></div>
          <div><dt>Попытки проверок <small>По выбранной роли</small></dt><dd>${profile.attempts.length}</dd></div>
        </dl>
      </section>
      <section class="settings-section">
        <div><h2>Удаление профиля</h2><p>Удалит отметки опыта, ответы и результаты. ${demo ? 'Откроется новый пустой профиль.' : 'Сессия завершится.'}</p></div>
        <div>${button('Удалить профиль','confirm-delete','danger')}</div>
      </section>
    </div>`;
}
