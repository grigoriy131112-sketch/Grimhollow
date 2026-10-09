import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import LorePage from './Lore.jsx';
import WorldPage from './World.jsx';
import SettingsPage from './Settings.jsx';
import CreatorsPage from './Creators.jsx';

// The Codex — the hero's journal as a real book (Wave W-CODEX/W-SHELL). It opens
// from the small nav strip and from a bookmark in the character's inventory, and
// reuses the existing pages so there is one implementation of each chapter and
// never a second copy to drift.
//
// It behaves like a book: a closed cover, then a two-leaf spread whose right
// leaf is the open chapter. Turning a page flips the leaf and advances through
// the chapters in order; the table of contents on the left leaf jumps anywhere.

const CHAPTERS = [
  { key: 'lore', label: 'Лор', page: LorePage, blurb: 'Что известно о мире, богах и землях.' },
  { key: 'map', label: 'Карта мира', page: WorldPage, blurb: 'Где стоит отряд и куда ведут дороги.' },
  { key: 'settings', label: 'Настройки', page: SettingsPage, blurb: 'Как устроена эта летопись.' },
  { key: 'creators', label: 'Создатели', page: CreatorsPage, blurb: 'Кто сделал Grimhollow и на чём.' },
];

const isChapter = (key) => CHAPTERS.some((c) => c.key === key);
const indexOf = (key) => Math.max(0, CHAPTERS.findIndex((c) => c.key === key));

export default function CodexPage() {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('tab');
  const [open, setOpen] = useState(false);
  const [leaf, setLeaf] = useState(() => (isChapter(fromUrl) ? indexOf(fromUrl) : 0));
  const [flip, setFlip] = useState(null);

  const chapter = CHAPTERS[leaf];
  const Section = chapter.page;

  useEffect(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', CHAPTERS[leaf].key);
      return next;
    }, { replace: true });
  }, [leaf, setParams]);

  const turn = useCallback((dir) => {
    setLeaf((current) => {
      const target = current + dir;
      if (target < 0 || target >= CHAPTERS.length) return current;
      setFlip(dir > 0 ? 'next' : 'prev');
      return target;
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') turn(1);
      else if (e.key === 'ArrowLeft') turn(-1);
      else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, turn]);

  useEffect(() => {
    if (!flip) return undefined;
    const t = setTimeout(() => setFlip(null), 480);
    return () => clearTimeout(t);
  }, [flip]);

  if (!open) {
    return (
      <div className="book-stage">
        <button type="button" className="book-cover" onClick={() => setOpen(true)} aria-label="Открыть дневник">
          <span className="book-cover-frame">
            <span className="book-cover-mark" aria-hidden="true">☠</span>
            <span className="book-cover-title">Дневник Гримхолла</span>
            <span className="book-cover-sub">Лор · Карта · Настройки · Создатели</span>
            <span className="book-cover-hint">Нажмите, чтобы открыть</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="book-stage">
      <div className="book" role="group" aria-label="Дневник">
        <div className="book-spread">
          <aside className="book-leaf book-leaf-left">
            <h2 className="book-leaf-title">Содержание</h2>
            <ol className="book-toc">
              {CHAPTERS.map((c, i) => (
                <li key={c.key}>
                  <button
                    type="button"
                    className={`book-toc-item ${i === leaf ? 'active' : ''}`}
                    onClick={() => { setFlip(i > leaf ? 'next' : 'prev'); setLeaf(i); }}
                  >
                    <span className="book-toc-num">{i + 1}</span>
                    <span>
                      <span className="book-toc-label">{c.label}</span>
                      <span className="book-toc-blurb muted small">{c.blurb}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="book-folio muted small">лист {leaf + 1} из {CHAPTERS.length}</p>
          </aside>

          <div className={`book-leaf book-leaf-right ${flip ? `flip-${flip}` : ''}`}>
            <h2 className="book-leaf-title">{chapter.label}</h2>
            <div className="book-page">
              <Section />
            </div>
          </div>
        </div>

        <div className="book-controls">
          <button type="button" className="book-turn" disabled={leaf === 0} onClick={() => turn(-1)}>
            ‹ Назад
          </button>
          <span className="muted small">лист {leaf + 1} / {CHAPTERS.length}</span>
          <button type="button" className="book-turn" disabled={leaf === CHAPTERS.length - 1} onClick={() => turn(1)}>
            Вперёд ›
          </button>
          <button type="button" className="book-turn book-close" onClick={() => setOpen(false)}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
