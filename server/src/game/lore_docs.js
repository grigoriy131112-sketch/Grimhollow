// Lore catalogue and Markdown parser (Wave W-MENU).
//
// The canon lives in docs/lore/*.md. This module is the only bridge from those
// files to the API: it lists the documents and turns one into structured blocks
// so the client can render it without any HTML injection. Pure — no I/O here.

export const LORE_DOCS = [
  { key: 'canon', title: 'Канон', file: 'README.md', blurb: 'Коротко о мире, завязка героя и три правды.' },
  { key: 'world', title: 'Мир', file: 'world.md', blurb: 'Устройство мира, царство мёртвых, смерть и память.' },
  { key: 'continents', title: 'Континенты', file: 'continents.md', blurb: 'Пять земель под одним серым небом.' },
  { key: 'cosmology', title: 'Боги и магия', file: 'cosmology.md', blurb: 'Боги, магия и забвение как сила.' },
  { key: 'campaign', title: 'Сюжет', file: 'campaign.md', blurb: 'Главная линия по главам.' },
  { key: 'bestiary', title: 'Бестиарий', file: 'bestiary.md', blurb: 'Монстры, правила спавна и добыча.' },
];

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

// A stable Latin key from a Russian heading, so lore "learned" flags can point
// at a section without depending on its position in the file.
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'section';
}

const isTableSeparator = (cells) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));

// Turn one lore document into { title, sections }, where each section carries
// typed blocks the client can render directly (no raw HTML).
export function parseLore(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const h1 = lines.find((l) => /^#\s+/.test(l));
  const title = h1 ? h1.replace(/^#\s+/, '').trim() : '';

  const sections = [];
  const seen = new Map();
  let current = null;
  let table = null;
  let para = null;

  const flushTable = () => {
    if (table && current && table.rows.length) current.blocks.push(table);
    table = null;
  };
  const flushPara = () => {
    if (para && current) current.blocks.push({ t: 'p', text: para });
    para = null;
  };
  const flushAll = () => { flushTable(); flushPara(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const heading2 = line.match(/^##\s+(.*)/);
    const heading3 = line.match(/^###\s+(.*)/);

    if (/^#\s+/.test(line)) continue; // the document title

    if (heading2) {
      flushAll();
      const text = heading2[1].trim();
      let key = slugify(text);
      const n = seen.get(key) || 0;
      seen.set(key, n + 1);
      if (n) key = `${key}-${n + 1}`;
      current = { key, title: text, blocks: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;

    if (heading3) {
      flushAll();
      current.blocks.push({ t: 'h', text: heading3[1].trim() });
      continue;
    }
    if (/^\|/.test(line)) {
      flushPara();
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      if (isTableSeparator(cells)) continue;
      if (!table) table = { t: 'table', rows: [] };
      table.rows.push(cells);
      continue;
    }
    flushTable();

    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    if (bullet) { flushPara(); current.blocks.push({ t: 'li', text: bullet[1].trim() }); continue; }
    const ordered = line.match(/^\s*\d+\.\s+(.*)/);
    if (ordered) { flushPara(); current.blocks.push({ t: 'li', text: ordered[1].trim() }); continue; }

    const text = line.trim();
    if (!text) { flushPara(); continue; }
    // Canon paragraphs are hard-wrapped in the source; join the lines back.
    para = para ? `${para} ${text}` : text;
  }
  flushAll();

  return { title, sections };
}
