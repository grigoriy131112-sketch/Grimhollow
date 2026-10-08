// Lore catalogue service (Wave W-MENU). Reads the canon Markdown from
// docs/lore/ and hands it to the client as structured blocks. The only place
// that touches the filesystem; parsing itself lives in game/lore_docs.js.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LORE_DOCS, parseLore } from '../game/lore_docs.js';

const LORE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../../docs/lore',
);

export function listLore() {
  return LORE_DOCS.map((d) => ({ key: d.key, title: d.title, blurb: d.blurb }));
}

export function getLore(key) {
  const doc = LORE_DOCS.find((d) => d.key === key);
  if (!doc) throw new Error('Документ не найден');
  const file = path.join(LORE_DIR, doc.file);
  let markdown;
  try {
    markdown = fs.readFileSync(file, 'utf8');
  } catch {
    throw new Error('Документ недоступен');
  }
  const parsed = parseLore(markdown);
  return {
    key: doc.key,
    title: doc.title,
    blurb: doc.blurb,
    docTitle: parsed.title,
    sections: parsed.sections,
  };
}
