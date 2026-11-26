// Выгружает демонстрационные фикстуры фронтенда в JSON для Python-бэкенда.
// Запуск из корня: node tools/export_catalog.mjs
// Результат: app/backend/data/catalog.json (серверные данные, ключи ответов не уходят в браузер).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checks, dimensions, directions, experience, formats, initialMaterials, levels, regions, roles, skills, snapshot, vacancies,
} from '../app/frontend/demo/catalog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = {
  meta: {
    version: 'catalog-demo-v1',
    generated: new Date().toISOString().slice(0, 10),
    generator: 'tools/export_catalog.mjs',
    source: 'app/frontend/demo/catalog.mjs',
  },
  snapshot, regions, formats, levels, dimensions, experience, skills, directions, roles, vacancies,
  checks, materials: initialMaterials(),
};
const target = resolve(root, 'app/backend/data/catalog.json');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
const size = (await import('node:fs')).statSync(target).size;
console.log(`catalog.json: ${data.vacancies.length} вакансий, ${data.materials.length} материалов, ${size} байт -> ${target}`);
