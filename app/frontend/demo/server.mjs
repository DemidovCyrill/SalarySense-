import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dimensions, directions, experience, formats, getRole, levels, regions, roles, skills, snapshot, vacancies } from './catalog.mjs';
import { mockAsk } from './knowledge.mjs';
import { attemptMaterial, jobMatch, makeLetter, market, mockExplanation, newSession, portalDate, publicAttempt, publicProfile, publishedChecks } from './model.mjs';

const staticRoot = fileURLToPath(new URL('../public/',import.meta.url));
const sessions = new Map();
const port = Number(process.env.PORT ?? 4173);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.webp':'image/webp', '.svg':'image/svg+xml' };
const cookie = id => `salarysense_demo=${id}; Path=/; HttpOnly; SameSite=Strict`;
const json = (response, status, value) => {
  response.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  response.end(JSON.stringify(value));
};
function assert(condition, status, message) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
async function bodyOf(request) {
  if (request.method === 'GET') return {};
  const parts = [];
  let length = 0;
  for await (const part of request) {
    length += part.length;
    assert(length <= 24000,413,'Данные запроса слишком большие.');
    parts.push(part);
  }
  try {
    const input = JSON.parse(Buffer.concat(parts).toString() || '{}');
    assert(input && !Array.isArray(input) && typeof input === 'object',400,'Ожидается объект.');
    return input;
  } catch {
    throw Object.assign(new Error('Не удалось прочитать запрос.'), { status:400 });
  }
}
const route = (method, pattern, handle) => ({ method, pattern, handle });
const profileAt = ({ session }) => publicProfile(session);

const routes = [
  route('GET',/^\/bootstrap$/, ({ session }) => ({
    profile:publicProfile(session), directions,
    roles:roles.map(role => ({
      ...role, criteria:session.materials.some(item => item.roleId === role.id && item.type === 'criterion' && item.status === 'published'),
    })),
    levels, dimensions, skills, regions, formats, experience,
    checks:publishedChecks(session), snapshot, editor:{ mode:'demo', available:true },
  })),
  route('GET',/^\/profile$/, profileAt),
  route('PATCH',/^\/profile$/, ({ session, input }) => {
    const profile = session.profile;
    if (Object.hasOwn(input,'roleId')) assert(getRole(input.roleId),400,'Выберите роль из каталога.');
    if (Object.hasOwn(input,'region')) assert(regions.includes(input.region),400,'Выберите регион из списка.');
    if (Object.hasOwn(input,'format')) assert(formats.includes(input.format),400,'Выберите формат из списка.');
    if (input.claim) {
      const { id, rank } = input.claim;
      assert(getRole(input.roleId ?? profile.roleId)?.skillIds.includes(id),400,'Навык отсутствует в каталоге роли.');
      assert(rank === null || Number.isInteger(rank) && rank >= 0 && rank < experience.length,400,'Выберите опыт из списка.');
      if (rank === null) delete profile.claims[id];
      else profile.claims[id] = rank;
    }
    for (const key of ['roleId','region','format']) {
      if (Object.hasOwn(input,key)) profile[key] = input[key];
    }
    profile.revision++;
    return publicProfile(session);
  }),
  route('DELETE',/^\/profile$/, ({ id, response }) => {
    sessions.delete(id);
    const nextId = randomUUID();
    const fresh = newSession(false);
    sessions.set(nextId,fresh);
    response.setHeader('Set-Cookie',cookie(nextId));
    return publicProfile(fresh);
  }),
  route('GET',/^\/market$/, ({ session, url }) => {
    const roleId = url.searchParams.get('roleId') ?? session.profile.roleId;
    const filters = {
      region:url.searchParams.get('region') ?? session.profile.region,
      format:url.searchParams.get('format') ?? session.profile.format,
    };
    const mode = url.searchParams.get('mode') ?? 'demo';
    assert(!roleId || getRole(roleId),400,'Роль отсутствует в каталоге.');
    assert(regions.includes(filters.region) && formats.includes(filters.format) && ['demo','live'].includes(mode),400,'Проверьте условия поиска.');
    return market(session,roleId,filters,mode);
  }),
  route('GET',/^\/vacancies\/([\w-]+)$/, ({ session, args:[jobId] }) => {
    const job = vacancies.find(item => item.id === jobId);
    assert(job,404,'Вакансия не найдена.');
    const comparison = jobMatch(session,job.requirements,job.roleId);
    return { ...job, ...comparison, explanation:mockExplanation(job,comparison) };
  }),
  route('POST',/^\/vacancies\/([\w-]+)\/letter$/, ({ session, input, args:[jobId] }) => {
    const job = vacancies.find(item => item.id === jobId);
    assert(job,404,'Вакансия не найдена.');
    assert(Array.isArray(input.facts),400,'Выберите факты для письма.');
    return { text:makeLetter(job,session,input.facts) };
  }),
  route('GET',/^\/criteria\/([\w-]+)$/, ({ session, args:[roleId] }) => {
    assert(getRole(roleId),404,'Роль не найдена.');
    return session.materials.filter(item => item.roleId === roleId && item.type === 'criterion' && item.status === 'published');
  }),
  route('POST',/^\/checks\/([\w-]+)\/attempts$/, ({ session, args:[checkId], input }) => {
    const roleId = session.profile.roleId;
    const existing = session.attempts.find(item => item.checkId === checkId && item.roleId === roleId && !item.result);
    const returnTo = typeof input.returnTo === 'string' && /^#\/(checks|skills|vacancies\/[\w-]+)$/.test(input.returnTo) ? input.returnTo : '#/checks';
    if (existing) {
      existing.returnTo = returnTo;
      return publicAttempt(session,existing);
    }
    const bank = session.materials.find(item => item.id === checkId && item.roleId === roleId && item.type === 'quiz' && item.status === 'published');
    assert(bank,404,'Проверка для выбранной роли недоступна.');
    const attempt = { id:randomUUID(), checkId, roleId, revision:bank.version, answers:{}, result:null, returnTo };
    session.attempts.push(attempt);
    return publicAttempt(session,attempt);
  }),
  route('GET',/^\/attempts\/([\w-]+)$/, ({ session, args:[attemptId] }) => publicAttempt(session,ownedAttempt(session,attemptId))),
  route('PUT',/^\/attempts\/([\w-]+)\/answers\/(\d+)$/, ({ session, input, args:[attemptId,index] }) => {
    const attempt = ownedAttempt(session,attemptId);
    assert(!attempt.result,409,'Попытка уже завершена.');
    const position = Number(index);
    const question = attemptMaterial(session,attempt).questions[position];
    assert(question && Number.isInteger(input.option) && input.option >= 0 && input.option <= question.options.length,400,'Выберите ответ из списка.');
    attempt.answers[position] = input.option;
    return publicAttempt(session,attempt);
  }),
  route('POST',/^\/attempts\/([\w-]+)\/finish$/, ({ session, args:[attemptId] }) => {
    const attempt = ownedAttempt(session,attemptId);
    const { questions } = attemptMaterial(session,attempt);
    if (!attempt.result) {
      assert(Object.keys(attempt.answers).length === questions.length,409,'Ответьте на все вопросы или выберите «Не знаю».');
      const areas = questions.map(({ area,answer,options },index) => ({
        name:area, status:attempt.answers[index] === answer ? 'correct' : attempt.answers[index] === options.length ? 'unknown' : 'incorrect',
      }));
      attempt.result = { date:portalDate(), total:areas.length, correct:areas.filter(area => area.status === 'correct').length, areas };
      session.profile.revision++;
    }
    return { ...publicAttempt(session,attempt), profile:publicProfile(session) };
  }),
  route('GET',/^\/editor\/materials$/, ({ session }) => session.materials.map(publicMaterial)),
  route('POST',/^\/editor\/materials\/([\w-]+)\/(\d+)\/fork$/, ({ session, args:[materialId,version] }) => {
    const material = getMaterial(session,materialId,version);
    assert(['published','retired'].includes(material.status),409,'Новая версия доступна после публикации материала.');
    assert(!session.materials.some(item => item.id === materialId && ['draft','review'].includes(item.status)),409,'У материала уже есть версия в работе.');
    const next = Math.max(...session.materials.filter(item => item.id === materialId).map(item => item.version)) + 1;
    const draft = { ...structuredClone(material), version:next, status:'draft', date:portalDate() };
    session.materials.push(draft);
    return publicMaterial(draft);
  }),
  route('PATCH',/^\/editor\/materials\/([\w-]+)\/(\d+)$/, ({ session, input, args:[materialId,version] }) => {
    const material = getMaterial(session,materialId,version);
    assert(material.status === 'draft',409,'Редактировать можно только черновик материала.');
    assert([input.source,input.rights].every(value => validText(value,1000)),400,'Заполните источник и права, до 1000 символов в каждом поле.');
    if (material.type === 'quiz') {
      material.questions = editQuestions(material.questions,input.questions);
    } else {
      const texts = dimensions.map((_,index) => input.texts?.[index]);
      assert(texts.every(value => validText(value,1000)),400,'Заполните все критерии, до 1000 символов в каждом поле.');
      material.content = dimensions.map((dimension,index) => ({ dimension, text:texts[index].trim() }));
    }
    material.source = input.source.trim();
    material.rights = input.rights.trim();
    material.date = portalDate();
    return publicMaterial(material);
  }),
  route('POST',/^\/editor\/materials\/([\w-]+)\/(\d+)\/status$/, ({ session, input, args:[materialId,version] }) => {
    const material = getMaterial(session,materialId,version);
    const transitions = { draft:['review'], review:['published','draft'], published:['retired'] };
    assert(transitions[material.status]?.includes(input.status),409,'Этот переход недоступен.');
    if (input.status === 'published') {
      for (const prior of session.materials.filter(item => item.id === materialId && item.status === 'published')) prior.status = 'retired';
    }
    material.status = input.status;
    if (material.status !== 'retired') material.date = portalDate();
    return publicMaterial(material);
  }),
];

function publicMaterial({ questions, ...material }) {
  return questions ? { ...material, questions:questions.map(({ text,area,options }) => ({ text,area,options })) } : material;
}

function validText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function editQuestions(previous, questions) {
  assert(Array.isArray(questions) && questions.length === previous.length,400,'Число вопросов в версии должно совпадать с исходным банком.');
  return previous.map((item,index) => {
    const { text,area,options,answer } = questions[index] ?? {};
    assert(validText(text,800) && validText(area,160),400,`Заполните формулировку и тему вопроса ${index + 1}.`);
    assert(Array.isArray(options) && options.length === item.options.length && options.every(value => validText(value,200)),400,`Заполните варианты ответа на вопрос ${index + 1}.`);
    const updated = options.map(value => value.trim());
    assert(new Set(updated.map(value => value.toLocaleLowerCase('ru-RU'))).size === updated.length,400,`Варианты ответа на вопрос ${index + 1} должны различаться.`);
    const changed = updated.some((value,position) => value !== item.options[position]);
    assert(answer === null ? !changed : Number.isInteger(answer) && answer >= 0 && answer < updated.length,400,`Укажите верный вариант для вопроса ${index + 1}.`);
    return { text:text.trim(), area:area.trim(), options:updated, answer:answer ?? item.answer };
  });
}

function getMaterial(session,id,version) {
  const item = session.materials.find(record => record.id === id && record.version === Number(version));
  assert(item,404,'Версия материала не найдена.');
  return item;
}
function ownedAttempt(session,id) {
  const attempt = session.attempts.find(item => item.id === id);
  assert(attempt,404,'Попытка не найдена в текущем профиле.');
  return attempt;
}

async function handler(request,response) {
  const origin = `http://${request.headers.host}`;
  const url = new URL(request.url,origin);
  if (url.pathname === '/ask') {
    assert(request.method === 'POST',405,'Для вопроса используется POST.');
    assert(!request.headers.origin || request.headers.origin === origin,403,'Источник запроса не совпадает.');
    const { question } = await bodyOf(request);
    assert(typeof question === 'string' && question.trim() && question.length <= 600,400,'Введи вопрос до 600 символов.');
    json(response,200,mockAsk(question.trim()));
    return;
  }
  if (url.pathname.startsWith('/api/v1/')) {
    const path = url.pathname.slice('/api/v1'.length);
    const match = routes.find(item => item.method === request.method && item.pattern.test(path));
    assert(match,404,'Действие недоступно.');
    const args = match.pattern.exec(path).slice(1);
    assert(!request.headers.origin || request.headers.origin === origin,403,'Источник запроса не совпадает.');
    let id = /(?:^|;\s*)salarysense_demo=([\w-]+)/.exec(request.headers.cookie ?? '')?.[1];
    if (!sessions.has(id)) {
      id = randomUUID();
      sessions.set(id,newSession(true));
      response.setHeader('Set-Cookie',cookie(id));
    }
    const input = await bodyOf(request);
    const session = sessions.get(id);
    assert(session,409,'Профиль изменился. Обновите страницу и повторите.');
    json(response,200,match.handle({ session, args, url, input, response, id }));
    return;
  }
  assert(request.method === 'GET' || request.method === 'HEAD',405,'Разрешено только чтение.');
  const path = resolve(staticRoot,`.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  assert(path.startsWith(resolve(staticRoot) + sep) && types[extname(path)],404,'Файл не найден.');
  const contents = await readFile(path).catch(() => null);
  assert(contents,404,'Файл не найден.');
  response.writeHead(200, {
    'Content-Type':types[extname(path)], 'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  response.end(request.method === 'HEAD' ? undefined : contents);
}

const server = createServer((request,response) => {
  handler(request,response).catch(error => {
    if (!error.status) console.error(error);
    json(response,error.status ?? 500,{ message:error.status ? error.message : 'Не удалось выполнить запрос. Попробуйте ещё раз.' });
  });
});
server.listen(port,'127.0.0.1',() => console.log(`SalarySense · http://127.0.0.1:${server.address().port}`));
