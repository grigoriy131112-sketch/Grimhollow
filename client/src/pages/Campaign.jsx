import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import HeroTabs from '../HeroTabs.jsx';
import { Icon } from '../icons.jsx';

// Прогресс кампании (Wave G11). API живёт под /api/campaign (routes/campaign.js).
// api.js — общий файл других волн, поэтому экран держит свой маленький
// помощник запросов, как pages/Quests.jsx и pages/Trade.jsx.
async function getJson(path) {
  const res = await fetch(`/api${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Запрос не удался (${res.status})`);
  return data;
}
async function postJson(path, body) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Запрос не удался (${res.status})`);
  return data;
}

// Каждая глава -> существующая SVG-иконка из game-icons.net (без растров).
const CHAPTER_ICONS = {
  crossroads: 'crossroads',
  church: 'church',
  dead_wood: 'dead_wood',
  guarded_tower: 'guarded_tower',
  ancient_columns: 'ancient_columns',
  forest: 'forest',
  harbor: 'harbor',
  black_spire: 'black_spire',
};
const chapterIcon = (icon) => (CHAPTER_ICONS[icon] ? `/art/landmarks/${CHAPTER_ICONS[icon]}.svg` : null);

const ENDING_ICONS = {
  restore: 'church',
  freeze: 'guarded_tower',
  hollow_king: 'black_spire',
  none: 'crossroads',
};
const endingIcon = (key) => (ENDING_ICONS[key] ? `/art/landmarks/${ENDING_ICONS[key]}.svg` : null);

function ChapterCard({ chapter }) {
  return (
    <div className="card" style={{ borderColor: chapter.met ? '#355a37' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ display: 'inline-flex' }}><Icon src={chapterIcon(chapter.icon)} alt={chapter.title} size={30} /></span>
        <span style={{ flex: 1 }}>
          <b>{chapter.title}</b>
          <div className="muted small">глава {chapter.chapter} · {chapter.condition}</div>
        </span>
        <span className={`badge${chapter.met ? ' safe' : ''}`}>{chapter.met ? 'пройдена' : 'не начата'}</span>
      </div>
      <p className="muted small">Открывает: {chapter.unlocks}.</p>
    </div>
  );
}

function EndingCard({ candidate, chosen }) {
  return (
    <div className="card" style={{ borderColor: chosen ? 'var(--gold)' : candidate.available ? '#355a37' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ display: 'inline-flex' }}><Icon src={endingIcon(candidate.key)} alt={candidate.name} size={30} /></span>
        <span style={{ flex: 1 }}>
          <b>{candidate.name}</b>
          <div className="muted small">{candidate.available ? 'доступна' : 'закрыта'}{chosen ? ' · выбрана' : ''}</div>
        </span>
      </div>
      <p className="small muted">{candidate.description}</p>
      {candidate.reasons?.length > 0 && (
        <p className="muted small">Опора: {candidate.reasons.join('; ')}.</p>
      )}
    </div>
  );
}

export default function CampaignPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState([]);
  const [heroId, setHeroId] = useState(characterId || '');
  const [progress, setProgress] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getJson('/characters').then((list) => {
      setCharacters(list);
      if (!heroId && list.length) setHeroId(String(list[0].id));
    }).catch((e) => setError(e.message));
  }, []);

  const load = (id) => {
    if (!id) return;
    Promise.all([getJson(`/campaign/${id}`), getJson(`/campaign/${id}/ending`)])
      .then(([p, e]) => { setProgress(p); setPreview(e); })
      .catch((e) => setError(e.message));
  };
  useEffect(() => { load(heroId); }, [heroId]);

  const hero = useMemo(() => characters.find((c) => String(c.id) === String(heroId)) || null, [characters, heroId]);

  const run = async (fn, okMsg) => {
    if (!heroId) return setError('Сначала выберите героя.');
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fn();
      load(heroId);
      if (okMsg) setNotice(typeof okMsg === 'function' ? okMsg(res) : okMsg);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const onDerive = () => run(
    () => postJson(`/campaign/${heroId}/derive`),
    (res) => (res.added ? `Кампания продвинулась: +${res.added}.` : 'Новых глав нет — выполняйте задания.'),
  );
  const onClaim = () => run(
    () => postJson(`/campaign/${heroId}/trophy`),
    (res) => `Трофей добыт: «${res.item.name}».`,
  );
  const startFinal = async () => {
    if (!heroId) return setError('Сначала выберите героя.');
    setBusy(true); setError(''); setNotice('');
    try {
      const { battleId } = await postJson(`/campaign/${heroId}/final`);
      navigate(`/battles/${battleId}`);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  if (error && !progress) return <div className="error">{error}</div>;
  if (!progress) return <div className="muted center">Загрузка…</div>;

  const { finale, ending, epilogue } = progress;

  return (
    <div>
      <Link to={`/characters/${heroId}`} className="muted">← К герою</Link>
      <div className="page-head">
        <h1>🗼 Кампания</h1>
        <span className="badge">{hero ? `${hero.name} · главы ${progress.metCount}/${progress.totalCount}` : 'нет героя'}</span>
      </div>

      <HeroTabs characterId={heroId} active="campaign" />

      {error && <div className="error">{error}</div>}
      {notice && <p className="muted small">✓ {notice}</p>}

      <div className="card">
        <div className="grid2">
          <div>
            <label className="muted small" htmlFor="campaign-hero">Чей путь</label>
            <select id="campaign-hero" value={heroId} onChange={(e) => setHeroId(e.target.value)}>
              {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <span className="muted small">Уклон клана</span>
            <div className="muted small">
              {progress.doctrine ? `${progress.doctrine.name} — ${progress.doctrine.idea}` : 'клан ещё не основан'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: '0.6rem' }}>
          <button type="button" className="btn small ghost" disabled={busy} onClick={onDerive}>
            Свериться с заданиями
          </button>
        </div>
      </div>

      <h2>Главы</h2>
      <div className="cards">
        {progress.chapters.map((c) => <ChapterCard key={c.flag} chapter={c} />)}
      </div>

      <div className="card" style={{ borderColor: finale.ready ? 'var(--gold)' : undefined }}>
        <h2>Финал: {finale.location}</h2>
        <p className="muted small">
          Последний бой — не убить, а одолеть: {finale.boss?.name || 'Костяной Пастырь'}. Он держит ключ от каждого возвращения, а его Посох становится финальным трофеем.
        </p>
        <ul className="stats">
          {finale.requirements.map((r) => (
            <li key={r.key}><span>{r.met ? '✅' : '⬜'} {r.label}</span></li>
          ))}
          <li><span>{finale.haveTrophy ? '🏆' : '⬜'} Трофей: «{finale.trophy.name}»{finale.haveTrophy ? ' — добыт' : ''}</span></li>
        </ul>
        {finale.battle && (
          <p className="good-tag">Финальный бой уже идёт.</p>
        )}
        {finale.canClaim && (
          <button type="button" className="btn" disabled={busy} onClick={onClaim}>
            Забрать «{finale.trophy.name}»
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={busy || (!finale.battle && !finale.ready)}
          onClick={finale.battle ? () => navigate(`/battles/${finale.battle.id}`) : startFinal}
        >
          {finale.battle ? 'Вернуться к финалу' : finale.won ? 'Пройти финал снова' : 'Открыть Чёрный шпиль'}
        </button>
        {!finale.ready && (
          <p className="muted small">Пока закрыто: {finale.requirements.filter((r) => !r.met).map((r) => r.label.toLowerCase()).join('; ')}.</p>
        )}
      </div>

      <h2>Концовки</h2>
      <div className="cards">
        {(preview?.candidates || []).map((c) => (
          <EndingCard key={c.key} candidate={c} chosen={ending.key === c.key} />
        ))}
      </div>

      <div className="card">
        <h2>Эпилог: {epilogue.title}</h2>
        <p className="small">{epilogue.lines.join(' ')}</p>
        <ul className="stats">
          {epilogue.voices.map((v) => (
            <li key={v.key}><span>{v.tone === 'warm' ? '🕯' : '🕳'} {v.name}: {v.text}</span></li>
          ))}
        </ul>
        <p className="muted small">
          Тёплых строк: {epilogue.warmLines} из {epilogue.voices.length}. Мнение фракций и живые спутники меняют эпитафии.
        </p>
      </div>
    </div>
  );
}
