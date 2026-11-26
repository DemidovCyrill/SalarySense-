import { badge, escape as e, icon, link, money, number, percent } from './ui.js';

export const modeBadge = mode => mode === 'live' ? badge('Реальные данные','neutral') : badge('Демо','mint');
export const fill = (value, tone = 'mint') => `<span class="fill ${tone}" style="--value:${Math.min(100,Math.max(0, Number(value) || 0))}%"></span>`;

export function histogram(salary) {
  if (salary.median == null) return `<div class="chart-empty">${icon('chart',25)}<div><strong>Недостаточно данных</strong><p>${salary.eligible} из ${salary.minimum} необходимых вилок</p></div></div>`;
  const maximum = Math.max(1,...salary.histogram.map(item => item.count));
  const peak = salary.histogram.findIndex(item => item.count === maximum);
  return `<figure class="histogram">
    <div class="plot" aria-hidden="true">${salary.histogram.map((item,index) => `<div class="bar-col">
      <span class="bar ${peak === index ? 'peak' : ''}" style="--height:${item.count / maximum * 100}%"><small>${number(item.count)}</small></span>
      <span class="axis-label">${e(item.label)}</span></div>`).join('')}</div>
    <figcaption class="chart-caption">Середины вилок, тыс. ₽ / мес. · высота столбца показывает число вакансий</figcaption>
    <p class="sr-only">${salary.histogram.map(item => `${e(item.label)} тысяч рублей: ${number(item.count)}.`).join(' ')}</p>
  </figure>`;
}

function sampleRows(match) {
  const rows = match.rows ?? [];
  const covered = rows.find(row => row.profileShare >= 1);
  const gap = rows.find(row => row.mandatory && row.profileShare < 1) ?? rows.find(row => row.profileShare < 1);
  return [covered,gap].filter(Boolean).map(row => {
    const check = row.checked?.find(record => record.correct / record.total === row.verified);
    const states = [row.declared > 0 && 'Заявлено', check && `${row.declared > 0 ? 'квиз' : 'Квиз'} ${number(check.correct)}/${number(check.total)}`].filter(Boolean);
    const state = states.length ? states.join(' · ') : 'Нет данных';
    const next = row.profileShare >= 1 ? 'Совпадает' : row.profileShare > 0 ? 'Уточнить навык' : 'Добавить сведения';
    return `<tr><th scope="row">${e(row.skill)}</th><td>${e(state)}</td><td class="${row.profileShare >= 1 ? 'is-covered' : 'is-gap'}">${next}</td></tr>`;
  }).join('');
}

function preview(job) {
  const rows = sampleRows(job.match);
  const gap = job.match.gaps[0];
  return `<section class="overview-preview" aria-labelledby="overview-preview-title">
    <header class="overview-preview-head"><div><p>${e(job.company)} · ${e(job.format)}</p><h2 id="overview-preview-title">${e(job.title)}</h2></div>${job.mode === 'demo' ? '<span class="overview-preview-mode">Демо</span>' : ''}</header>
    <dl class="overview-scores">
      <div><dt>Совпадение по профилю</dt><dd>${percent(job.match.profile)}</dd></div>
      <div><dt>Покрыто проверками</dt><dd>${percent(job.match.verified)}</dd></div>
    </dl>
    ${rows ? `<table class="overview-requirements"><thead><tr><th scope="col">Навык</th><th scope="col">В профиле</th><th scope="col">Что дальше</th></tr></thead><tbody>${rows}</tbody></table>` : gap ? `<p class="overview-preview-note">Уточни обязательное требование «${e(gap)}».</p>` : '<p class="overview-preview-note">Открой разбор, чтобы увидеть требования и источники.</p>'}
  </section>`;
}

function activity(label, detail, href) {
  return `<a class="overview-activity" href="${href}"><span><strong>${label}</strong><small>${e(detail)}</small></span></a>`;
}

export function overview(data, market, role, featured) {
  const { profile } = data;
  const unavailable = market?.status === 'source-unavailable';
  const first = role ? featured ?? market?.jobs.find(job => job.status === 'active') : null;
  const action = first
    ? link(first.mode === 'demo' ? 'Посмотреть пример разбора' : 'Разобрать вакансию',`#/vacancies/${encodeURIComponent(first.id)}`,'primary')
    : unavailable ? link('Открыть карту навыков','#/skills','primary') : link(role ? 'Изменить условия поиска' : 'Выбрать роль','#/roles','primary');
  const description = role
    ? 'Узнай, какие требования закрывает твой профиль и что стоит подтянуть перед откликом.'
    : 'Выбери роль в IT, чтобы заполнить профиль и сравнить его с требованиями работодателей.';
  const intro = `<section class="overview-intro" aria-labelledby="overview-title"><div class="overview-proposition">
    <h1 id="overview-title">Сравни навыки с вакансией</h1><p>${description}</p>${action}
  </div>${first ? preview(first) : role ? `<div class="overview-preview overview-preview-empty"><h2>${unavailable ? 'Источник вакансий недоступен' : 'Нет вакансий по этим условиям'}</h2><p>${unavailable ? 'Попробуй открыть обзор позже. Навыки и проверки доступны в профиле.' : 'Выбери другой регион или формат работы, чтобы увидеть вакансии по роли.'}</p></div>` : ''}</section>`;
  if (!role || !market) return `<div class="overview-page">${intro}</div>`;

  const claims = role.skillIds.filter(id => Number.isInteger(profile.claims[id])).length;
  const verified = new Set(profile.evidence.filter(item => item.correct > 0).map(item => `${item.skillId}/${item.topic}`)).size;
  const { salary } = market;
  const demo = market.source.mode === 'demo';
  const salaryInfo = unavailable ? 'Источник недоступен' : salary.median == null ? 'Недостаточно данных для медианы' : `${money(salary.median)} в месяц · ${salary.tax === 'gross' ? 'до налогов' : 'на руки'}`;
  return `<div class="overview-page">${intro}<div class="overview-columns">
    <section class="overview-workbench"><header><h2>Мой профиль</h2><a href="#/roles">${e(role.name)}</a></header>
      ${activity('Карта навыков',`${claims} из ${role.skillIds.length} навыков заявлено`,'#/skills')}
      ${activity('Короткие проверки',verified ? `Темы с верными ответами: ${verified}` : 'Можно проверить знание отдельной темы','#/checks')}
    </section>
    <section class="overview-workbench"><header><h2>Рынок по моей роли</h2><p>${e([profile.region,profile.format,demo ? 'демо' : ''].filter(Boolean).join(' · '))}</p></header>
      ${activity('Активные вакансии',unavailable ? 'Источник недоступен' : `В выборке: ${number(market.active)}`,'#/vacancies')}
      ${activity('Медиана зарплатных вилок',salaryInfo,'#/market')}
    </section>
  </div></div>`;
}

