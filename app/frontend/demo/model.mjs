import { checks, experience, formats, getRole, initialMaterials, regions, skills, snapshot, vacancies } from './catalog.mjs';

export const portalDate = () => new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Moscow' }).format(new Date());
export const defaultFilters = { region:regions[0], format:formats[0] };
const scores = [0.25,0.5,0.75,1];

export function newSession(sample) {
  return {
    profile:{
      roleId:sample ? 'frontend' : null, ...defaultFilters, revision:1, sample,
      claims:sample ? { 'html-css':2, javascript:3, typescript:2, react:2, api:1, git:2 } : {},
    },
    materials:initialMaterials(),
    attempts:sample ? checks.slice(0,2).map((check, index) => ({
      id:`sample-${check.id}`, checkId:check.id, revision:1, roleId:check.roleId,
      answers:{}, result:{
        date:snapshot.date, correct:index === 0 ? 3 : 2, total:check.questions.length,
        areas:check.questions.map((q, i) => ({ name:q.area, status:index === 1 && i === 2 ? 'unknown' : 'correct' })),
      },
    })) : [],
  };
}

function checkCard(material) {
  const { id, roleId, skillId, checkTopic, title, topic, limit, bankVersion, version, source, minutes, questions } = material;
  return {
    id, roleId, skillId, topic:checkTopic, title, scope:topic, limit, version:`${bankVersion}-v${version}`,
    source, minutes, count:questions.length,
  };
}

export function publishedChecks(session) {
  return session.materials.filter(item => item.type === 'quiz' && item.status === 'published').map(checkCard);
}

export function attemptMaterial(session,attempt) {
  return session.materials.find(item => item.type === 'quiz' && item.id === attempt.checkId && item.version === attempt.revision);
}

export function publicAttempt(session,attempt) {
  const material = attemptMaterial(session,attempt);
  return {
    ...checkCard(material), id:attempt.id, checkId:material.id, answers:attempt.answers, result:attempt.result,
    checkState:attempt.result ? 'complete' : 'active', returnTo:attempt.returnTo,
    questions:material.questions.map(({ text, options }, index) => ({ id:index, text, options:[...options,'Не знаю'] })),
  };
}

export function getEvidence(session, roleId) {
  return session.attempts.filter(attempt => attempt.roleId === roleId && attempt.result).map(attempt => {
    const { id, checkId, skillId, topic, scope, title, source, version, result } = publicAttempt(session,attempt);
    return { id, checkId, skillId, topic, scope, title, date:result.date, source, version, correct:result.correct, total:result.total };
  });
}

export function findMatches(requirements, claims, evidence) {
  const rows = requirements.map(item => {
    const declared = scores[claims[item.id]] ?? 0;
    const checked = evidence.filter(record => record.skillId === item.id && record.topic === item.topic);
    const verified = Math.max(0, ...checked.map(record => record.correct / record.total));
    return {
      ...item, declared, checked, verified,
      profileShare:Math.min(1, Math.max(declared, verified) / item.expected),
      checkedShare:Math.min(1, verified / item.expected),
    };
  });
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  const hasEvidence = rows.some(row => row.declared || row.checked.length);
  const percent = key => total && hasEvidence
    ? Math.round(100 * rows.reduce((sum, row) => sum + row[key] * row.weight, 0) / total) : null;
  return {
    profile:percent('profileShare'), verified:percent('checkedShare'),
    gaps:rows.filter(row => row.mandatory && row.profileShare < 1).map(row => row.skill),
    unknown:rows.filter(row => !row.declared && !row.checked.length).map(row => row.skill),
    rows, version:'matching-demo-v0.1',
  };
}

export function salaryStats(offers) {
  const values = [];
  const counts = { salary:0, missing:0, oneSided:0, incompatible:0 };
  for (const { salary } of offers) {
    if (!salary || (!salary.min && !salary.max)) { counts.missing++; continue; }
    counts.salary++;
    if (salary.currency !== 'RUB' || salary.tax !== 'gross' || salary.period !== 'month') { counts.incompatible++; continue; }
    if (!salary.min || !salary.max) { counts.oneSided++; continue; }
    values.push((salary.min + salary.max) / 2);
  }
  values.sort((a,b) => a - b);
  const quantile = share => {
    const index = (values.length - 1) * share;
    const floor = Math.floor(index);
    return Math.round(values[floor] + (values[Math.ceil(index)] - values[floor]) * (index - floor));
  };
  const enough = values.length >= 10;
  const bins = [{ max:150000, label:'до 150' }, { max:180000, label:'150–179' }, { max:210000, label:'180–209' }, { max:240000, label:'210–239' }, { max:270000, label:'240–269' }, { max:300000, label:'270–299' }, { max:Infinity, label:'300+' }];
  const histogram = bins.map(({ max,label }, i) => ({ label, count:values.filter(value => value < max && (!i || value >= bins[i - 1].max)).length }));
  return {
    ...counts, total:offers.length, eligible:values.length, minimum:10, version:'salary-demo-v0.1',
    median:enough ? quantile(0.5) : null, lower:enough ? quantile(0.25) : null, upper:enough ? quantile(0.75) : null,
    histogram:enough ? histogram : [], currency:'RUB', tax:'gross', period:'month',
  };
}

function fits(setting, value, options) {
  return setting === options[0] || setting === value;
}

export function market(session, roleId, filters, mode) {
  const source = { ...snapshot, mode };
  const accepted = mode === 'demo' && getRole(roleId);
  const offers = accepted ? vacancies.filter(job => job.roleId === roleId && fits(filters.region,job.region,regions) && fits(filters.format,job.format,formats)) : [];
  const active = offers.filter(job => job.status === 'active');
  const frequency = {};
  for (const job of active) {
    for (const { id, skill } of job.requirements) {
      frequency[id] ??= { id, skill, count:0 };
      frequency[id].count++;
    }
  }
  const evidence = getEvidence(session, roleId);
  return {
    source, roleId, filters,
    status:mode === 'live' ? 'source-unavailable' : active.length ? 'ready' : 'empty',
    active:active.length, stale:offers.filter(job => job.status === 'stale').length, archived:offers.filter(job => job.status === 'archived').length,
    salary:salaryStats(active), requirements:Object.values(frequency).sort((a,b) => b.count - a.count),
    jobs:offers.map(({ requirements, ...job }) => ({
      ...job, ...jobMatch(session, requirements, roleId, evidence, false),
    })),
  };
}

export function jobMatch(session, requirements, roleId, evidence = getEvidence(session,roleId), detailed = true) {
  const profile = session.profile;
  const { rows, ...match } = findMatches(requirements, profile.roleId === roleId ? profile.claims : {}, profile.roleId === roleId ? evidence : []);
  return {
    match:detailed ? { ...match, rows } : match,
    profileRevision:profile.revision,
  };
}

export function mockExplanation(job, { match,profileRevision }) {
  if (job.id === 'frontend-3' || job.status !== 'active') return { state:'unavailable' };
  if (match.profile === null) return { state:'insufficient-context' };
  const rows = [match.rows.find(row => row.verified > 0), match.rows.find(row => row.mandatory && row.profileShare < 1)].filter(Boolean);
  const sources = new Map();
  const sections = [];
  for (const row of new Set(rows)) {
    const requirementId = `vacancy:${job.id}:${row.id}`;
    sources.set(requirementId,{ id:requirementId, title:`Требование вакансии · ${row.skill}`, version:job.snapshotVersion, fragment:row.text });
    const evidence = row.checked.find(item => item.correct > 0);
    if (evidence) {
      sources.set(evidence.id,{
        id:evidence.id, title:`Результат короткой проверки · ${evidence.scope}`, version:evidence.version,
        fragment:`${evidence.correct} из ${evidence.total} верных ответов. Источник: ${evidence.source}.`,
      });
      sections.push({ text:`Часть требования по ${row.skill} покрыта проверкой по теме «${evidence.scope}».`, citationIds:[requirementId,evidence.id] });
    } else if (row.declared) {
      const profileId = `profile:${profileRevision}:${row.id}`;
      sources.set(profileId,{ id:profileId, title:'Заявленный опыт', version:`Профиль v${profileRevision}`, fragment:`Отметка пользователя по навыку «${row.skill}».` });
      sections.push({ text:`Опыт по ${row.skill} отмечен в профиле. Обязательное требование покрыто частично.`, citationIds:[requirementId,profileId] });
    } else {
      sections.push({ text:`По обязательному требованию «${row.skill}» пока нет сведений в профиле.`, citationIds:[requirementId] });
    }
  }
  return sections.length ? { state:'ready', mode:'demo', sections, sources:[...sources.values()] } : { state:'insufficient-context' };
}

export function publicProfile(session) {
  return {
    ...session.profile,
    evidence:getEvidence(session,session.profile.roleId),
    attempts:session.attempts.filter(item => item.roleId === session.profile.roleId).map(attempt => {
      const material = attemptMaterial(session,attempt);
      return { id:attempt.id, checkId:attempt.checkId, complete:!!attempt.result, title:material.title, scope:material.topic };
    }),
  };
}

export function makeLetter(job, session, facts) {
  const role = getRole(job.roleId);
  const evidence = getEvidence(session,role.id);
  const profile = session.profile;
  const allowed = [
    ...role.skillIds.filter(id => Number.isInteger(profile.claims[id])).map(id => [
      `claim:${id}`, `Мой заявленный опыт с «${skills[id].name}» — ${experience[profile.claims[id]].toLowerCase()}.`,
    ]),
    ...evidence.filter(item => item.correct > 0).map(item => [
      `evidence:${item.id}`, `В короткой проверке по теме «${item.scope}» я дал(а) ${item.correct} из ${item.total} правильных ответов.`,
    ]),
  ];
  const paragraphs = profile.roleId === job.roleId ? allowed.filter(([id]) => facts.includes(id)).map(([,text]) => text) : [];
  return [`Здравствуйте! Меня заинтересовала позиция «${job.title}» в ${job.company}.`, ...paragraphs, 'Буду рад(а) обсудить задачи команды и ответить на вопросы.'].join('\n\n');
}
