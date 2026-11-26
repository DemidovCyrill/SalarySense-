import { badge, button, date, empty, escape as e, heading, icon, materialStatus, option, selectControl } from './ui.js';

const categories = { criterion:'Критерий', quiz:'Банк вопросов' };
const materialTitle = item => item.level ?? item.title ?? item.topic;

export function editorPage(state) {
  const { data, materials, materialView } = state;
  if (!data.editor.available) return empty('Доступ к материалам закрыт','Редакция доступна участникам с соответствующей ролью.');
  const visible = materials.filter(item => (materialView.role === 'all' || item.roleId === materialView.role) && (materialView.type === 'all' || item.type === materialView.type));
  const description = data.editor.mode === 'demo'
    ? 'Критерии и банки вопросов. Изменения действуют в текущей демосессии.'
    : 'Критерии, банки вопросов и история их версий.';
  return `<div class="editor-page">
    ${heading('Редакция материалов',description)}
    <section aria-label="Реестр материалов">
      <div class="filters editor-filters">
        <div class="form-field"><label for="editor-role">Роль</label>${selectControl('id="editor-role" data-material-filter="role"',option('all',materialView.role,'Все роли') + data.roles.map(role => option(role.id,materialView.role,role.name)).join(''))}</div>
        <div class="form-field"><label for="editor-type">Тип материала</label>${selectControl('id="editor-type" data-material-filter="type"',option('all',materialView.type,'Все материалы') + Object.entries(categories).map(([id,name]) => option(id,materialView.type,name)).join(''))}</div>
      </div>
      ${visible.length ? `<div class="editor-columns" aria-hidden="true"><span>Материал</span><span>Тип</span><span>Версия</span><span>Статус</span><span></span></div>
      <ul class="editor-registry">${visible.map(item => {
        const role = data.roles.find(role => role.id === item.roleId);
        const title = materialTitle(item);
        return `<li class="editor-entry">
          <div class="editor-entry-title"><strong>${e(title)}</strong><span>${e(role?.name)}</span></div>
          <span class="editor-entry-type">${e(categories[item.type])}</span>
          <span class="editor-entry-version"><span class="sr-only">Версия </span><span aria-hidden="true">v</span>${e(item.version)}</span>
          <span class="editor-entry-status">${badge(...materialStatus(item.status))}</span>
          <button type="button" class="button quiet editor-open" data-action="material" data-value="${e(`${item.id}/${item.version}`)}">Открыть<span class="sr-only"> ${e(title)} · ${e(role?.name)} · версия ${e(item.version)}</span></button>
        </li>`;
      }).join('')}</ul>` : empty('Материалов нет','Измени роль или тип материала.')}
    </section></div>`;
}

function questionFields(questions) {
  return `<p class="muted">Укажи верный вариант для каждого вопроса, где изменился список ответов.</p>
    ${questions.map(({ text,area,options },index) => `<fieldset class="stack compact-stack editor-question">
      <legend>Вопрос ${index + 1}</legend>
      <label class="form-field">Формулировка<textarea name="question-${index}" rows="2" maxlength="800" required>${e(text)}</textarea></label>
      <label class="form-field">Тема в результате<input name="area-${index}" value="${e(area)}" maxlength="160" required></label>
      ${options.map((value,position) => `<label class="form-field">Вариант ${position + 1}<input name="option-${index}-${position}" value="${e(value)}" maxlength="200" required></label>`).join('')}
      <div class="form-field"><label for="answer-${index}">Верный вариант</label>${selectControl(`id="answer-${index}" name="answer-${index}"`,
        option('','','Сохранить прежний ключ') + options.map((_,position) => option(String(position),'',String(position + 1))).join(''))}</div>
    </fieldset>`).join('')}`;
}

function questionPreview(questions) {
  return `<div class="stack compact-stack">${questions.map(({ text,area,options },index) => `<details class="source-details">
    <summary>Вопрос ${index + 1} · ${e(area)}</summary>
    <p>${e(text)}</p><ol>${options.map(value => `<li>${e(value)}</li>`).join('')}</ol>
  </details>`).join('')}</div>`;
}

export function materialDialog(material, data) {
  const role = data.roles.find(role => role.id === material.roleId);
  const isDraft = material.status === 'draft';
  const isQuiz = material.type === 'quiz';
  const controls = {
    draft:button('На проверку','material-status','primary','review'),
    review:button('Вернуть в черновик','material-status','secondary','draft') + button('Опубликовать','material-status','primary','published'),
    published:button('Вывести из оценки','material-status','secondary','retired') + button('Создать новую версию','fork-material','primary'),
    retired:button('Создать новую версию','fork-material','primary'),
  };
  return `<div class="material-dialog">
    <header class="dialog-heading">
      <div><p class="material-context">${e(categories[material.type])} · ${e(role?.name)}</p>
      <h2 id="dialog-title">${e(materialTitle(material))}</h2>
      <div class="material-meta">${badge(...materialStatus(material.status))}<span>Версия ${e(material.version)} · ${date(material.date)}</span></div></div>
      <button class="icon-button" type="button" data-action="close-dialog" aria-label="Закрыть">${icon('x')}</button>
    </header>
    ${isDraft ? `<form id="material-form" class="stack compact-stack" autocomplete="off">
      <fieldset class="stack compact-stack material-fields">
        <legend>Источник и права</legend>
        <label class="form-field">Источник<input name="source" value="${e(material.source)}" maxlength="1000" required></label>
        <label class="form-field">Права на использование<input name="rights" value="${e(material.rights)}" maxlength="1000" required></label>
      </fieldset>
      <fieldset class="stack compact-stack material-fields">
        <legend>${isQuiz ? 'Вопросы' : 'Критерии оценки'}</legend>
        ${isQuiz ? questionFields(material.questions) : material.content.map(({ dimension,text },index) => `<label class="form-field">${e(dimension)}<textarea name="text-${index}" rows="2" maxlength="1000" required>${e(text)}</textarea></label>`).join('')}
      </fieldset>
      <div class="actions material-actions"><button class="button secondary" type="submit">Сохранить черновик</button>${controls.draft}</div>
    </form>` : `<div class="stack compact-stack">
      <section><h3>Источник и права</h3>
        <dl class="material-details"><div><dt>Источник</dt><dd>${e(material.source)}</dd></div><div><dt>Права</dt><dd>${e(material.rights)}</dd></div></dl>
      </section>
      <section><h3>${isQuiz ? 'Вопросы' : 'Критерии оценки'}</h3>
        ${isQuiz ? questionPreview(material.questions) : `<dl class="material-details">${material.content.map(({ dimension,text }) => `<div><dt>${e(dimension)}</dt><dd>${e(text)}</dd></div>`).join('')}</dl>`}
      </section>
      <div class="actions material-actions">${controls[material.status] ?? ''}</div>
    </div>`}</div>`;
}
