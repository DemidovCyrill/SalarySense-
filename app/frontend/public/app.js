import { api } from './api.js';
import { editorPage, materialDialog } from './editor.js';
import { knowledgePage } from './knowledge.js';
import { letterPage, marketPage, vacanciesPage, vacancyPage, vacancyResults } from './market-pages.js';
import { overview } from './overview.js';
import { attemptPage, checksPage, levelsPage, profilePage, renderRoleList, renderSkillList, rolesPage, skillsPage } from './profile-pages.js';
import { button, empty, escape as e, heading, icon, link } from './ui.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const notice = document.querySelector('#notice');
const defaultVacancyFilters = { search:'', level:'', status:'active', sort:'newest' };
const state = {
  data:null, role:null, route:[], page:'overview', direction:'all', roleSearch:'', skillSearch:'', skillView:'all',
  level:'Intern', criteria:[], checkId:null, returnTo:'#/checks', attempt:null, question:null,
  mode:'demo', market:null, featured:null, compareRole:'', compare:null,
  roleFiltersOpen:false, marketFiltersOpen:false, vacancyFiltersOpen:false, vacancyFilters:{ ...defaultVacancyFilters },
  job:null, letterText:null, selectedFacts:[],
  materials:[], materialView:{ role:'all', type:'all' }, activeMaterial:null,
  knowledge:{ question:'', answer:null, waiting:false, error:'' },
};

const navigation = [
  { id:'overview', title:'Обзор', href:'#/' },
  { id:'vacancies', title:'Вакансии', href:'#/vacancies' },
  { id:'skills', title:'Карта навыков', href:'#/skills' },
  { id:'market', title:'Рынок IT', href:'#/market' },
];
const profileNav = [
  { id:'roles', title:'Роль и условия', href:'#/roles' },
  { id:'checks', title:'Проверки', href:'#/checks' },
  { id:'levels', title:'Уровни', href:'#/levels' },
];
const otherNav = [
  { id:'knowledge', title:'База знаний', href:'#/knowledge' },
  { id:'profile', title:'Настройки', href:'#/profile' },
  { id:'editor', title:'Редакция', href:'#/editor' },
];
const moreNavigation = [...profileNav,...otherNav];
const allNavigation = [...navigation,...moreNavigation];
let ticket = 0;
let toastTimer;
let busy = false;
let errorMessage = '';
let loading = false;
let previousHash = '';
let moreNavigationOpen = false;
const letterDrafts = new Map();

function notify(message, error = false) {
  if (error && dialog.open) {
    dialog.querySelector('.dialog-error')?.remove();
    const alert = document.createElement('p');
    alert.className = 'dialog-error callout amber';
    alert.setAttribute('role','alert');
    alert.textContent = message;
    dialog.prepend(alert);
    alert.scrollIntoView({ block:'nearest' });
    return;
  }
  notice.textContent = message;
  notice.classList.toggle('error',error);
  notice.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => notice.classList.remove('visible'),4200);
}

function updateProfile(profile) {
  const previousRole = state.data.profile.roleId;
  state.data.profile = profile;
  state.role = state.data.roles.find(role => role.id === profile.roleId) ?? null;
  if (previousRole !== profile.roleId) {
    state.skillSearch = '';
    state.skillView = 'all';
    state.compareRole = '';
    state.vacancyFilters = { ...defaultVacancyFilters };
  }
}

function navItems(items) {
  return items.filter(item => item.id !== 'editor' || state.data.editor.available).map(item => {
    const active = state.page === item.id;
    return `<a class="nav-item ${active ? 'active' : ''}" href="${item.href}"${active ? ' aria-current="page"' : ''}>${item.title}</a>`;
  }).join('');
}
const logo = `<a href="#/" class="wordmark"><img src="/assets/mark.svg" alt="" width="35" height="35"><span>Salary<span>Sense</span></span></a>`;

function navigationPanel() {
  const expanded = moreNavigationOpen || moreNavigation.some(item => item.id === state.page);
  return `<nav aria-label="Основное меню">${navItems(navigation)}
    <details class="nav-more"${expanded ? ' open' : ''}>
      <summary>Все разделы${icon('down',16)}</summary>
      <div class="nav-group"><span class="nav-label">Мой профиль</span>${navItems(profileNav)}</div>
      <div class="nav-group"><span class="nav-label">Сервис</span>${navItems(otherNav)}</div>
    </details>
  </nav>`;
}

function layout(content) {
  const label = allNavigation.find(item => item.id === state.page)?.title ?? 'Обзор';
  const demo = state.data.snapshot.mode === 'demo';
  const contextRole = state.role
    ? `<a class="context-role" href="#/roles">${e(state.role.name)}</a>`
    : link('Выбрать роль','#/roles','quiet');
  return `<aside class="sidebar">
    <div class="sidebar-brand">${logo}</div>
    ${navigationPanel()}
  </aside>
  <div class="workspace">
    <header class="topbar">
      <div class="topbar-left"><button type="button" class="icon-button mobile-menu" data-action="open-menu" aria-label="Открыть меню">${icon('menu',23)}</button>
      <div class="mobile-brand">${logo}</div><div class="breadcrumb">${e(label)}</div></div>
      <div class="topbar-right">${demo ? '<span class="demo-badge">Демо-режим</span>' : ''}${contextRole}</div>
    </header>
    <main id="main" class="main" tabindex="-1"${loading ? ' aria-busy="true"' : ''}>${content}</main>
  </div>`;
}

const chooseRole = () => heading('Сначала выбери роль','По роли мы подберём навыки, проверки и вакансии.',link('Открыть каталог','#/roles','primary'));

function screen() {
  if (loading) return '<div class="loading card" role="status"><span class="loader" aria-hidden="true"></span> Загружаем данные…</div>';
  if (errorMessage) return empty('Данные недоступны',errorMessage,button('Повторить','retry','primary'),'warning');
  const [, section, id] = state.route;
  switch (state.page) {
    case 'overview': return overview(state.data,state.market,state.role,state.featured);
    case 'roles': return rolesPage(state);
    case 'skills': return state.role ? skillsPage(state) : chooseRole();
    case 'levels': return state.role ? levelsPage(state) : chooseRole();
    case 'checks':
      if (section === 'attempt') return attemptPage(state);
      if (!state.role) return chooseRole();
      return checksPage(state);
    case 'market': return state.role ? marketPage(state) : chooseRole();
    case 'vacancies':
      if (id === 'letter') return letterPage(state);
      if (section) return vacancyPage(state);
      return state.role ? vacanciesPage(state) : chooseRole();
    case 'profile': return profilePage(state);
    case 'editor': return editorPage(state);
    case 'knowledge': return knowledgePage(state);
    default: return empty('Страница не найдена','Продолжи с экрана обзора.',link('На обзор','#/','primary'),'search');
  }
}

function render(preserve) {
  app.innerHTML = layout(screen());
  const label = allNavigation.find(item => item.id === state.page)?.title;
  document.title = label ? `${label} · SalarySense` : 'SalarySense';
  if (preserve?.name) {
    const element = [...app.querySelectorAll(preserve.name)].find(item => Object.entries(preserve.data).every(([key,value]) => item.dataset[key] === value));
    element?.focus({ preventScroll:true });
  }
}

function requestMarket(roleId, mode = state.mode) {
  const { region,format } = state.data.profile;
  return api.market(roleId,region,format,mode);
}

function locationOf() {
  const [pathname, query] = location.hash.slice(1).split('?');
  return { parts:pathname.split('/').filter(Boolean), params:new URLSearchParams(query) };
}
function returnPath(value) {
  return typeof value === 'string' && /^#\/(checks|skills|vacancies\/[\w-]+)$/.test(value) ? value : '#/checks';
}

async function load(focus = false, keepPage = false, preserve) {
  const current = ++ticket;
  const { parts,params } = locationOf();
  const [page,section,id] = parts;
  if (state.route[0] === 'vacancies' && state.route[2] === 'letter' && state.job?.id === state.route[1]) {
    letterDrafts.set(state.job.id,{ text:state.letterText, facts:state.selectedFacts });
  }
  state.route = parts;
  state.page = page ?? 'overview';
  errorMessage = '';
  loading = false;
  state.checkId = page === 'checks' && section === 'start' ? id : null;
  state.returnTo = returnPath(params.get('return'));
  if (state.checkId && !state.data.checks.some(check => check.id === state.checkId && check.roleId === state.role?.id)) {
    errorMessage = 'Проверка для выбранной роли недоступна.';
    render();
    return;
  }
  if (page === 'vacancies' && id === 'letter') {
    const draft = letterDrafts.get(section);
    state.letterText = draft?.text ?? null;
    state.selectedFacts = draft?.facts ?? [];
  }
  let work;
  const roleId = state.role?.id;
  if (page === 'checks' && section === 'attempt') {
    work = api.attempt(id).then(attempt => ({ attempt, question:null, returnTo:returnPath(attempt.returnTo) }));
  } else if (page === 'vacancies' && section) {
    work = api.job(section).then(job => ({ job }));
  } else if (page === 'market' && roleId) {
    const comparison = state.compareRole ? requestMarket(state.compareRole) : null;
    work = Promise.all([requestMarket(roleId),comparison]).then(([market,compare]) => ({ market,compare }));
  } else if (page === 'vacancies' && roleId) {
    work = requestMarket(roleId).then(market => ({ market }));
  } else if (state.page === 'overview' && roleId) {
    work = requestMarket(roleId,state.data.snapshot.mode).then(async market => {
      const job = market.jobs.find(item => item.status === 'active');
      const featured = job ? await api.job(job.id).catch(() => null) : null;
      return { market,featured };
    });
  } else if (page === 'levels' && roleId) {
    work = api.criteria(roleId).then(criteria => ({ criteria }));
  } else if (page === 'editor' && state.data.editor.available) {
    work = api.materials().then(materials => ({ materials }));
  }
  if (work && !keepPage) {
    loading = true;
    render();
  }
  try {
    if (work) {
      const delta = await work;
      if (current !== ticket) return;
      Object.assign(state,delta);
    }
  } catch (error) {
    if (current !== ticket) return;
    errorMessage = error.message;
  }
  loading = false;
  render(preserve);
  if (focus) {
    window.scrollTo(0,0);
    document.querySelector('#main')?.focus({ preventScroll:true });
  }
}

function go(href) {
  if (location.hash === href) void load(true);
  else location.hash = href;
}

function openDialog(markup, drawer = false) {
  dialog.classList.toggle('drawer',drawer);
  dialog.setAttribute('aria-labelledby','dialog-title');
  dialog.innerHTML = markup;
  if (!dialog.open) dialog.showModal();
}

dialog.addEventListener('close',() => {
  if (!dialog.open) {
    const material = state.activeMaterial;
    dialog.replaceChildren();
    state.activeMaterial = null;
    if (material && state.page === 'editor') {
      const trigger = [...app.querySelectorAll('[data-action="material"]')]
        .find(item => item.dataset.value === `${material.id}/${material.version}`);
      (trigger ?? document.querySelector('#main'))?.focus({ preventScroll:true });
    }
  }
});

function confirmDelete() {
  const description = state.data.snapshot.mode === 'demo'
    ? 'Карта навыков, ответы и результаты проверок будут удалены из локальной сессии. Откроется новый профиль.'
    : 'Карта навыков, ответы и результаты проверок будут удалены. Текущая сессия завершится.';
  openDialog(`<div class="dialog-heading"><div><span class="tile amber">${icon('trash',22)}</span><h2 id="dialog-title">Удалить профиль?</h2><p>${description}</p></div></div>
    <div class="actions"><button type="button" class="button secondary" data-action="close-dialog" autofocus>Отмена</button>
    ${button('Удалить профиль','delete-profile','danger')}</div>`);
}

function showMaterial(item) {
  state.activeMaterial = item;
  openDialog(materialDialog(item,state.data));
}

function updateMaterialDialog(item) {
  if (dialog.open && state.activeMaterial?.id === item.id) {
    showMaterial(item);
    const title = dialog.querySelector('#dialog-title');
    title.tabIndex = -1;
    title.focus({ preventScroll:true });
  }
}

function saveMaterial(form) {
  const input = new FormData(form);
  const { id,version,type,questions } = state.activeMaterial;
  const fields = { source:input.get('source'), rights:input.get('rights') };
  if (type === 'quiz') {
    fields.questions = questions.map((question,index) => {
      const answer = input.get(`answer-${index}`);
      return {
        text:input.get(`question-${index}`), area:input.get(`area-${index}`),
        options:question.options.map((_,optionIndex) => input.get(`option-${index}-${optionIndex}`)),
        answer:answer === '' || answer == null ? null : Number(answer),
      };
    });
  } else {
    fields.texts = state.data.dimensions.map((_,index) => input.get(`text-${index}`));
  }
  return api.saveMaterial(id,version,fields);
}

async function refreshCatalog() {
  const data = await api.bootstrap();
  Object.assign(state.data,{ roles:data.roles, checks:data.checks });
  updateProfile(data.profile);
}

async function mutate(control, operation) {
  if (busy) return;
  busy = true;
  if (control instanceof HTMLButtonElement || control instanceof HTMLSelectElement) control.disabled = true;
  try {
    await operation();
  } catch (error) {
    notify(error.message,true);
  } finally {
    busy = false;
    if (control instanceof HTMLButtonElement || control instanceof HTMLSelectElement) control.disabled = false;
  }
}

function preserve(control) {
  const dataset = Object.entries(control.dataset).filter(([key]) => !['index'].includes(key));
  const name = dataset.map(([key]) => {
    const attribute = key.replace(/[A-Z]/g,letter => `-${letter.toLowerCase()}`);
    return `[data-${attribute}]`;
  }).join('');
  if (name && control.name) return { name:`${name}[name="${CSS.escape(control.name)}"]`, data:Object.fromEntries(dataset) };
  return { name,data:Object.fromEntries(dataset) };
}

async function finishCheck() {
  const attempt = await api.finish(state.attempt.id);
  updateProfile(attempt.profile);
  state.attempt = attempt;
  render();
  document.querySelector('#main')?.focus();
}

const actions = {
  'retry':() => load(true),
  'retry-bootstrap':() => boot(),
  'open-menu':() => openDialog(`<div class="dialog-heading"><span id="dialog-title">${logo}</span><button type="button" class="icon-button" data-action="close-dialog" aria-label="Закрыть меню">${icon('x')}</button></div>${navigationPanel()}`,true),
  'close-dialog':() => dialog.close(),
  'choose-role':async (value,control) => {
    updateProfile(await api.saveProfile({ roleId:value }));
    render(preserve(control));
    document.querySelector('.role-card.is-current .button')?.focus({ preventScroll:true });
    notify('Роль выбрана.');
  },
  'skill-view':(value,control) => { state.skillView = value; render(preserve(control)); },
  'choose-level':(value,control) => { state.level = value; render(preserve(control)); },
  'start-check':async value => {
    const attempt = await api.start(value,state.returnTo);
    if (!state.data.profile.attempts.some(item => item.id === attempt.id)) {
      state.data.profile.attempts.push({ id:attempt.id, checkId:attempt.checkId, complete:false });
    }
    go(`#/checks/attempt/${attempt.id}`);
  },
  'quiz-question':value => { state.question = Number(value); render(); document.querySelector('#main')?.focus({ preventScroll:true }); },
  'finish-check':finishCheck,
  'reset-vacancy-filters':() => {
    state.vacancyFilters = { ...defaultVacancyFilters };
    render();
    document.querySelector('[data-vacancy-filter="search"]')?.focus();
  },
  'use-demo':(value,control) => {
    state.mode = 'demo';
    return load(false,false,preserve(control));
  },
  'knowledge-example':value => {
    state.knowledge.question = value;
    const field = document.querySelector('#knowledge-form textarea');
    field.value = value;
    field.focus();
  },
  'generate-letter':async () => {
    const id = state.job.id;
    const { text } = await api.letter(id,state.selectedFacts);
    if (state.job?.id !== id || state.route[2] !== 'letter') return;
    state.letterText = text;
    render();
    document.querySelector('[data-letter-text]')?.focus();
    notify('Черновик готов.');
  },
  'copy-letter':async () => {
    if (!state.letterText?.trim()) {
      document.querySelector('[data-letter-text]')?.focus();
      notify('Сначала напиши письмо или создай черновик.',true);
      return;
    }
    try {
      await navigator.clipboard.writeText(state.letterText);
      notify('Черновик скопирован.');
    } catch {
      document.querySelector('[data-letter-text]')?.select();
      notify('Доступ к буферу обмена закрыт. Текст выделен для копирования.',true);
    }
  },
  'confirm-delete':confirmDelete,
  'delete-profile':async () => {
    updateProfile(await api.deleteProfile());
    await refreshCatalog();
    state.job = null;
    state.letterText = null;
    state.selectedFacts = [];
    letterDrafts.clear();
    state.knowledge = { question:'', answer:null, waiting:false, error:'' };
    dialog.close();
    notify('Профиль и результаты удалены.');
    go('#/roles');
  },
  'material':value => {
    const item = state.materials.find(item => `${item.id}/${item.version}` === value);
    if (item) showMaterial(item);
  },
  'fork-material':async () => {
    const { id,version } = state.activeMaterial;
    const material = await api.forkMaterial(id,version);
    await load(false,true);
    updateMaterialDialog(material);
    notify('Новая версия создана.');
  },
  'material-status':async value => {
    const { id,version,status } = state.activeMaterial;
    if (status === 'draft') {
      const form = dialog.querySelector('#material-form');
      if (!form.reportValidity()) return;
      await saveMaterial(form);
    }
    const material = await api.materialStatus(id,version,value);
    await refreshCatalog();
    await load(false,true);
    updateMaterialDialog(material);
    notify('Статус материала обновлён.');
  },
};

document.addEventListener('click',event => {
  const more = event.target.closest('.nav-more > summary');
  if (more) moreNavigationOpen = !more.parentElement.open;
  const target = event.target.closest('button[data-action]');
  if (target && actions[target.dataset.action]) {
    void mutate(target,() => actions[target.dataset.action](target.dataset.value,target));
    return;
  }
  if (event.target.closest('.skip')) {
    event.preventDefault();
    document.querySelector('#main')?.focus();
  }
  const anchor = event.target.closest('a[href^="#/"]');
  if (anchor && dialog.open && dialog.classList.contains('drawer')) dialog.close();
});

app.addEventListener('toggle',event => {
  if (!event.target.isConnected) return;
  if (event.target.dataset.filterGroup === 'vacancy') state.vacancyFiltersOpen = event.target.open;
  if (event.target.dataset.filterGroup === 'market') state.marketFiltersOpen = event.target.open;
  if (event.target.dataset.filterGroup === 'roles') state.roleFiltersOpen = event.target.open;
},true);

document.addEventListener('input',event => {
  const field = event.target;
  if (field.dataset.action === 'role-search') {
    state.roleSearch = field.value;
    document.querySelector('#role-list').innerHTML = renderRoleList(state);
  }
  if (field.dataset.action === 'skill-search') {
    state.skillSearch = field.value;
    document.querySelector('#skill-list').innerHTML = renderSkillList(state);
  }
  if (field.dataset.vacancyFilter === 'search') {
    state.vacancyFilters.search = field.value;
    document.querySelector('#vacancy-results').innerHTML = vacancyResults(state);
  }
  if (field.hasAttribute('data-letter-text')) state.letterText = field.value;
  if (field.name === 'question' && field.form?.id === 'knowledge-form') state.knowledge.question = field.value;
});

document.addEventListener('change',event => {
  const field = event.target;
  if (field.hasAttribute('data-role-direction')) {
    state.direction = field.value;
    document.querySelector('#role-list').innerHTML = renderRoleList(state);
  } else if (field.dataset.action === 'profile-filter' || field.dataset.setting) {
    const setting = field.dataset.setting ?? field.name;
    const original = state.data.profile[setting];
    const value = field.value;
    field.value = original;
    void mutate(field,async () => {
      updateProfile(await api.saveProfile({ [setting]:value }));
      await load(false,false,preserve(field));
      notify('Условия поиска обновлены.');
    });
  } else if (field.dataset.action === 'save-claim') {
    const id = field.dataset.value;
    const original = state.data.profile.claims[id];
    void mutate(field,async () => {
      try {
        updateProfile(await api.saveProfile({ claim:{ id,rank:field.value === '' ? null : Number(field.value) } }));
      } catch (error) {
        field.value = original ?? '';
        throw error;
      }
      render(preserve(field));
      notify('Карта навыков обновлена.');
    });
  } else if (field.hasAttribute('data-market-mode') || field.hasAttribute('data-compare-role')) {
    if (field.hasAttribute('data-market-mode')) state.mode = field.value;
    else state.compareRole = field.value;
    void load(false,false,preserve(field));
  } else if (field.dataset.vacancyFilter && field.dataset.vacancyFilter !== 'search') {
    state.vacancyFilters[field.dataset.vacancyFilter] = field.value;
    document.querySelector('#vacancy-results').innerHTML = vacancyResults(state);
  } else if (field.hasAttribute('data-letter-fact')) {
    if (field.checked) state.selectedFacts.push(field.value);
    else state.selectedFacts = state.selectedFacts.filter(id => id !== field.value);
  } else if (field.dataset.materialFilter) {
    state.materialView[field.dataset.materialFilter] = field.value;
    render(preserve(field));
  }
});

document.addEventListener('submit',event => {
  const form = event.target;
  if (form.id === 'knowledge-form') {
    event.preventDefault();
    const knowledge = state.knowledge;
    if (knowledge.waiting) return;
    const question = new FormData(form).get('question').trim();
    if (!question) {
      notify('Введи вопрос.',true);
      return;
    }
    knowledge.waiting = true;
    knowledge.error = '';
    knowledge.answer = null;
    render();
    void api.ask(question).then(answer => {
      knowledge.answer = answer;
    }).catch(error => {
      knowledge.error = error.message;
    }).finally(() => {
      knowledge.waiting = false;
      if (state.knowledge === knowledge && state.page === 'knowledge') {
        render();
        const heading = document.querySelector('#knowledge-answer-title');
        if (heading) {
          heading.tabIndex = -1;
          heading.focus();
        } else document.querySelector('#knowledge-form textarea')?.focus();
      }
    });
  } else if (form.dataset.action === 'quiz-answer') {
    event.preventDefault();
    const option = new FormData(form).get('option');
    if (option === null) { notify('Выбери вариант ответа или «Не знаю».',true); return; }
    const index = Number(form.dataset.index);
    const activeId = state.attempt.id;
    void mutate(event.submitter,async () => {
      const attempt = await api.answer(activeId,index,Number(option));
      if (state.route[2] !== activeId) return;
      state.attempt = attempt;
      if (index === attempt.questions.length - 1 && Object.keys(attempt.answers).length === attempt.questions.length) {
        try { await finishCheck(); }
        catch (error) { state.question = null; render(); throw error; }
        return;
      }
      state.question = index < attempt.questions.length - 1 ? index + 1 : null;
      render();
      document.querySelector('#main')?.focus({ preventScroll:true });
    });
  } else if (form.id === 'material-form') {
    event.preventDefault();
    void mutate(event.submitter,async () => {
      const material = await saveMaterial(form);
      await load(false,true);
      updateMaterialDialog(material);
      notify('Черновик сохранён.');
    });
  }
});

window.addEventListener('hashchange',() => {
  if (!state.data || location.hash === '#main') return;
  if (dialog.open) dialog.close();
  if (location.hash !== previousHash) {
    previousHash = location.hash;
    void load(true);
  }
});

async function boot() {
  app.innerHTML = '<main id="main" tabindex="-1" class="initial"><span class="loader" aria-hidden="true"></span> Загрузка SalarySense…</main>';
  try {
    state.data = await api.bootstrap();
    state.mode = state.data.snapshot.mode;
    updateProfile(state.data.profile);
    previousHash = location.hash;
    if (!state.role && !location.hash) go('#/roles');
    else await load();
  } catch (error) {
    app.innerHTML = `<main id="main" tabindex="-1" class="initial">${empty('SalarySense не загрузился',error.message,button('Повторить','retry-bootstrap','primary'),'warning')}</main>`;
  }
}
void boot();
