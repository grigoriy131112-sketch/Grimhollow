import test from 'node:test';
import '../test-support/env.js';
import assert from 'node:assert/strict';
import { parseLore, slugify, LORE_DOCS } from '../src/game/lore_docs.js';
import { listLore, getLore } from '../src/services/lore.js';

test('slugify transliterates Russian headings to stable Latin keys', () => {
  assert.equal(slugify('Коротко'), 'korotko');
  assert.equal(slugify('Жёсткие рамки (не нарушать)'), 'zhestkie-ramki-ne-narushat');
  assert.equal(slugify('  ---  '), 'section');
});

test('parseLore splits sections and types the blocks', () => {
  const md = [
    '# Заголовок документа',
    '',
    '## Первый раздел',
    '',
    'Абзац с **важным** словом.',
    '',
    '### Подзаголовок',
    '- пункт один',
    '1. пункт два',
    '',
    '| ключ | значение |',
    '|------|----------|',
    '| a | b |',
    '',
    '## Второй раздел',
    'просто текст',
  ].join('\n');

  const { title, sections } = parseLore(md);
  assert.equal(title, 'Заголовок документа');
  assert.equal(sections.length, 2);
  assert.equal(sections[0].key, 'pervyy-razdel');
  assert.equal(sections[0].title, 'Первый раздел');

  const types = sections[0].blocks.map((b) => b.t);
  assert.deepEqual(types, ['p', 'h', 'li', 'li', 'table']);
  const table = sections[0].blocks.find((b) => b.t === 'table');
  assert.deepEqual(table.rows, [['ключ', 'значение'], ['a', 'b']]);
  assert.equal(sections[1].blocks[0].text, 'просто текст');
});

test('parseLore joins hard-wrapped paragraph lines into one block', () => {
  const { sections } = parseLore('## Раздел\n\nпервая строка\nвторая строка\n\nновый абзац');
  const ps = sections[0].blocks.filter((b) => b.t === 'p');
  assert.equal(ps.length, 2);
  assert.equal(ps[0].text, 'первая строка вторая строка');
});

test('parseLore gives duplicate headings unique keys', () => {
  const { sections } = parseLore('## Одно\n\na\n\n## Одно\n\nb');
  assert.deepEqual(sections.map((s) => s.key), ['odno', 'odno-2']);
});

test('listLore exposes every canon document with a title and blurb', () => {
  const list = listLore();
  assert.equal(list.length, LORE_DOCS.length);
  for (const d of list) {
    assert.ok(d.key && d.title && d.blurb, `incomplete entry: ${JSON.stringify(d)}`);
  }
});

test('getLore parses a real canon file into sections', () => {
  const doc = getLore('canon');
  assert.equal(doc.key, 'canon');
  assert.ok(doc.docTitle.includes('Гримхоллоу'));
  assert.ok(doc.sections.length >= 2);
  assert.ok(doc.sections.some((s) => s.key === 'korotko'));
});

test('getLore rejects an unknown key', () => {
  assert.throws(() => getLore('nope'), /не найден/i);
});
