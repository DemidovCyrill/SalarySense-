import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { findMatches, salaryStats } from '../app/frontend/demo/model.mjs';

test('формулы отделяют самооценку, совместимую проверку и малую выборку', () => {
  const requirements = [
    { id:'java', topic:'core', weight:3, expected:1, mandatory:true },
    { id:'api', topic:'rest', weight:3, expected:1 },
    { id:'sql', topic:'design', weight:2, expected:1 },
    { id:'ci', topic:'general', weight:2, expected:1 },
  ].map(item => ({ ...item, skill:item.id }));
  const evidence = [
    { skillId:'java', topic:'core', correct:3, total:3 },
    { skillId:'api', topic:'rest', correct:1, total:2 },
    { skillId:'sql', topic:'joins', correct:3, total:3 },
  ];
  const result = findMatches(requirements,{ java:3,api:2,sql:1 },evidence);
  assert.deepEqual([result.profile,result.verified], [63,45]);
  assert.deepEqual(result.rows[2].checked,[]);
  assert.equal(findMatches([],{},[]).profile,null);
  assert.equal(salaryStats([]).median,null);
});

test('демо-API поддерживает рынок, попытки, приватность и контракт базы знаний', async t => {
  const entry = fileURLToPath(new URL('../app/frontend/demo/server.mjs',import.meta.url));
  const child = spawn(process.execPath,[entry],{ env:{ ...process.env, PORT:'0' }, stdio:['ignore','pipe','inherit'] });
  t.after(() => child.kill());
  const output = createInterface({ input:child.stdout });
  const [startup] = await once(output,'line',{ signal:AbortSignal.timeout(8000) });
  const base = startup.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  let cookie = '';
  async function query(path, { method='GET', body, owner=true, status=200 } = {}) {
    const response = await fetch(base + path,{
      method, headers:{ Cookie:owner ? cookie : '', 'Content-Type':'application/json' },
      body:body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status,status,path);
    const session = response.headers.get('set-cookie');
    if (owner && session) cookie = session.split(';')[0];
    return response.json();
  }

  const bootstrap = await query('/api/v1/bootstrap');
  assert.equal(bootstrap.profile.roleId,'frontend');
  const market = await query('/api/v1/market?roleId=frontend');
  assert.deepEqual([market.active,market.stale,market.archived,market.salary.median,market.salary.eligible],[22,1,1,230000,19]);
  const { explanation } = await query('/api/v1/vacancies/frontend-1');
  assert.equal(explanation.state,'ready');
  assert(explanation.sections.every(section => section.citationIds.every(id => explanation.sources.some(source => source.id === id))));
  assert.equal((await query('/api/v1/vacancies/frontend-3')).explanation.state,'unavailable');
  assert.equal((await query('/api/v1/market?roleId=frontend&mode=live')).status,'source-unavailable');
  assert.equal((await query('/api/v1/market?roleId=qa')).salary.median,null);
  const profile = await query('/api/v1/profile',{ method:'PATCH', body:{ roleId:'qa',claim:{ id:'sql',rank:0 } } });
  assert.equal(profile.claims.sql,0);
  assert.equal(profile.evidence.length,0);

  const attempt = await query('/api/v1/checks/qa-sql/attempts',{ method:'POST',body:{ returnTo:'#/skills' } });
  const path = '/api/v1/attempts/' + attempt.id;
  assert.equal(attempt.returnTo,'#/skills');
  assert(attempt.questions.every(question => !Object.hasOwn(question,'answer')));
  await query(path,{ owner:false,status:404 });
  await query(path + '/finish',{ method:'POST',status:409 });

  const bank = '/api/v1/editor/materials/qa-sql';
  const draft = await query(bank + '/1/fork',{ method:'POST' });
  assert(draft.questions.every(question => !Object.hasOwn(question,'answer')));
  const updated = draft.questions.map(question => ({ ...question, answer:null }));
  updated[0] = { ...updated[0], text:'Какой вариант выберет эту строку?', options:['Новый вариант',...updated[0].options.slice(1)] };
  const patch = { source:draft.source, rights:draft.rights, questions:updated };
  await query(bank + '/2',{ method:'PATCH', body:patch, status:400 });
  updated[0].answer = 0;
  await query(bank + '/2',{ method:'PATCH', body:patch });
  await query(bank + '/2/status',{ method:'POST', body:{ status:'review' } });
  await query(bank + '/2/status',{ method:'POST', body:{ status:'published' } });
  assert.equal((await query(path)).questions[0].text,attempt.questions[0].text);

  for (const [index,option] of [4,2,0].entries()) {
    await query(path + '/answers/' + index,{ method:'PUT',body:{ option } });
  }
  const completed = await query(path + '/finish',{ method:'POST' });
  assert.equal(completed.result.correct,2);
  assert.equal(completed.result.areas[0].status,'unknown');
  assert.deepEqual(await query(path + '/finish',{ method:'POST' }),completed);
  const next = await query('/api/v1/checks/qa-sql/attempts',{ method:'POST' });
  assert.notEqual(next.version,attempt.version);
  assert.equal(next.questions[0].text,updated[0].text);
  const previousCookie = cookie;
  assert.equal((await query('/api/v1/profile',{ method:'DELETE' })).roleId,null);
  assert.notEqual(cookie,previousCookie);
  await query(path,{ status:404 });

  const answer = await query('/ask',{ method:'POST',body:{ question:'Что подтверждает короткая проверка?' } });
  assert.equal(answer.sources[0].id,'FR06');
  const missing = await query('/ask',{ method:'POST',body:{ question:'Сколько лун у Юпитера?' } });
  assert.deepEqual(missing,{ answer:'В документах нет этой информации.',sources:[] });
  await query('/ask',{ method:'POST',body:{ question:' ' },status:400 });
});
