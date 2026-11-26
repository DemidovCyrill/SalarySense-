import { button, escape as e, heading, safeUrl } from './ui.js';

const examples = ['Что подтверждает короткая проверка?', 'Как считается совпадение с вакансией?', 'Как считается медиана зарплат?'];

function renderSources(sources) {
  return `<section class="knowledge-sources" aria-label="Источники ответа">
    <h3>Источники</h3>
    ${sources.map(source => {
      const url = safeUrl(source.url);
      return `<details class="knowledge-source">
        <summary><span>${e(source.title)}</span><small>${e(source.id)}${source.page != null ? ` · с. ${e(source.page)}` : ''}</small></summary>
        <blockquote>${e(source.fragment)}</blockquote>
        ${url ? `<a class="button quiet" href="${e(url)}" target="_blank" rel="noopener noreferrer">Открыть источник</a>` : ''}
      </details>`;
    }).join('')}
  </section>`;
}

function renderAnswer({ answer, waiting, error }, demo) {
  if (waiting) return '<div class="knowledge-answer knowledge-loading" role="status"><span class="loader" aria-hidden="true"></span>Ищем ответ…</div>';
  if (error) return `<section class="knowledge-answer knowledge-error" role="alert"><h2>Ответ недоступен</h2><p>${e(error)}</p></section>`;
  if (!answer) return '';
  const { answer:text, sources } = answer;
  return `<section class="knowledge-answer" aria-labelledby="knowledge-answer-title">
    <div class="knowledge-answer-heading"><h2 id="knowledge-answer-title">Ответ по базе</h2>${demo ? '<span class="muted">Демо</span>' : ''}</div>
    <p class="knowledge-answer-text" role="status">${e(text)}</p>
    ${sources?.length ? renderSources(sources) : '<p class="muted">Подходящих источников нет.</p>'}
  </section>`;
}

export function knowledgePage(state) {
  const knowledge = state.knowledge;
  const demo = state.data.snapshot.mode === 'demo';
  return `${heading('База знаний','Задай вопрос о карте навыков, проверках или показателях рынка.')}
  <div class="knowledge-workspace${demo ? ' has-examples' : ''}">
    <form id="knowledge-form" aria-label="Вопрос базе знаний">
      <label class="form-field">Твой вопрос<textarea name="question" rows="3" maxlength="600" required placeholder="Введи вопрос">${e(knowledge.question)}</textarea></label>
      <button type="submit" class="button primary"${knowledge.waiting ? ' disabled' : ''}>Спросить</button>
    </form>
    ${demo ? `<section class="knowledge-examples" aria-labelledby="knowledge-examples-title">
      <h2 id="knowledge-examples-title">Примеры вопросов</h2>
      <p>В демо для этих вопросов есть готовые ответы.</p>
      <ul>${examples.map(example => `<li>${button(example,'knowledge-example','quiet',example)}</li>`).join('')}</ul>
    </section>` : ''}
    ${renderAnswer(knowledge,demo)}
  </div>`;
}
