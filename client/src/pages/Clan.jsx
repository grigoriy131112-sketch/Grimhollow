import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../icons.jsx';
import HeroTabs from '../HeroTabs.jsx';

// Клан игрока (Wave G9). API живёт под /api/clan (routes/clan.js). api.js —
// общий файл других волн, поэтому экран держит свой маленький помощник
// запросов, как pages/Quests.jsx и pages/Trade.jsx.
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

// Иконка здания -> существующая SVG-иконка game-icons.net (без растров).
const iconSrc = (name) => (name ? `/art/landmarks/${name}.svg` : null);

const RESOURCE_LABELS = {
  ritualSuccess: 'успех ритуала',
  diplomacy: 'дипломатия',
  reviveDiscount: 'скидка на воскрешение',
  goldRate: 'добыча золота',
  memoryDamage: 'урон по забвению',
  madnessRisk: 'риск безумия',
  stealth: 'скрытность',
  trade: 'торговля',
  templeOpinion: 'мнение храмов',
  forestOpinion: 'мнение Леса',
  choirOpinion: 'мнение Хора',
  spirePower: 'сила шпиля',
  darkMagicDiscount: 'тёмная магия',
  namesPerRitual: 'имён за ритуал',
  mercenaryCap: 'наёмников',
  partyDefense: 'защита отряда',
  partyAttack: 'атака отряда',
  activeAbilities: 'умения клана',
  crossingDiscount: 'переходы',
  fleet: 'флот',
  thaw: 'оттаивание',
};

function effectText(effects) {
  const parts = [];
  for (const [key, value] of Object.entries(effects || {})) {
    const label = RESOURCE_LABELS[key] || key;
    if (typeof value === 'boolean') parts.push(value ? label : '');
    else if (value < 0) parts.push(`${label} ${value}`);
    else parts.push(`${label} +${Math.round(value * 100) / 100}`);
  }
  return parts.filter(Boolean).join(' · ');
}

function Requirement({ req }) {
  return (
    <li style={{ color: req.met ? 'inherit' : 'var(--muted, #9a8f7a)' }}>
      <span>{req.met ? '✓' : '✗'}</span> {req.label}
    </li>
  );
}

function Founding({ hero, view, onFound, busy }) {
  const [name, setName] = useState('');
  const [doctrine, setDoctrine] = useState(view.doctrines?.[0]?.key || '');
  const bases = view.requirements.requirements.find((r) => r.key === 'fleet')?.bases || [];
  const [base, setBase] = useState(bases[0]?.name || '');
  const ready = view.canFound && name.trim().length >= 2 && doctrine;

  return (
    <div className="card">
      <h2>Основать клан</h2>
      <p className="muted small">
        Клан основывают, когда пройдены главы 1–6, собран флот и есть союз хотя бы с одной силой.
        Уклон выбирается один раз и навсегда.
      </p>
      <ul className="stats">
        {view.requirements.requirements.map((r) => <Requirement key={r.key} req={r} />)}
      </ul>

      <div className="grid2">
        <div>
          <label className="muted small" htmlFor="clan-name">Имя клана</label>
          <input id="clan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Тихие Имена" />
        </div>
        <div>
          <label className="muted small" htmlFor="clan-base">Стоянка</label>
          <select id="clan-base" value={base} onChange={(e) => setBase(e.target.value)}>
            {bases.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
        </div>
      </div>

      <h3>Уклон</h3>
      <div className="cards">
        {view.doctrines.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`card${doctrine === d.key ? '' : ' ghost'}`}
            style={{ textAlign: 'left', cursor: 'pointer' }}
            onClick={() => setDoctrine(d.key)}
          >
            <b>{d.name}</b>
            <div className="muted small">{d.idea}</div>
            <p className="small">{d.description}</p>
            <p className="small">Даёт: {d.bonuses.join(', ')}</p>
            <p className="small muted">Цена: {d.price.join(', ')}</p>
          </button>
        ))}
      </div>

      <button type="button" className="btn" disabled={!ready || busy} onClick={() => onFound({ name, doctrine, base })}>
        Основать клан
      </button>
      {!view.canFound && <p className="muted small">Пока не выполнены все условия — клан не основать.</p>}
    </div>
  );
}

function BuildingCard({ def, holding, level, onBuild, busy }) {
  const built = !!holding;
  const maxed = holding?.maxed;
  const cost = built ? holding.nextCost : def.cost;
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ display: 'inline-flex' }}><Icon src={iconSrc(def.icon)} alt={def.name} size={30} /></span>
        <span style={{ flex: 1 }}>
          <b>{def.name}</b>
          <div className="muted small">{def.role}</div>
        </span>
        {built && <span className="badge">ярус {holding.tier}/{def.maxRank}</span>}
      </div>
      <p className="small muted">{def.description}</p>
      {!maxed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span className="small">{built ? 'Улучшить' : 'Построить'}: {cost.gold} 🪙 · {cost.names} ✎</span>
          <button type="button" className="btn small" disabled={busy} onClick={() => onBuild(def.type)}>
            {built ? 'Улучшить' : 'Построить'}
          </button>
        </div>
      )}
      {maxed && <p className="muted small">Выковано до предела.</p>}
    </div>
  );
}

export default function ClanPage() {
  const { leaderId } = useParams();
  const [characters, setCharacters] = useState([]);
  const [heroId, setHeroId] = useState(leaderId || '');
  const [view, setView] = useState(null);
  const [hireable, setHireable] = useState([]);
  const [party, setParty] = useState(null);
  const [garrison, setGarrison] = useState(null);
  const [petitions, setPetitions] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getJson('/characters').then((list) => {
      setCharacters(list);
      if (!heroId && list.length) setHeroId(String(list[0].id));
    }).catch((e) => setError(e.message));
  }, []);

  const load = async (id) => {
    if (!id) return;
    try {
      const v = await getJson(`/clan/leader/${id}`);
      setView(v);
      if (v.clan) {
        setHireable((await getJson(`/clan/leader/${id}/hireable`)).candidates || []);
        const g = await getJson(`/clan/leader/${id}/garrison`);
        setGarrison(g);
        setPetitions(g.petitions || []);
        setParty(await getJson(`/party/${id}`));
      } else {
        setHireable([]);
        setGarrison(null);
        setPetitions([]);
        setParty(null);
      }
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(heroId); }, [heroId]);

  const hero = useMemo(() => characters.find((c) => String(c.id) === String(heroId)) || null, [characters, heroId]);

  const run = async (fn, okMsg) => {
    if (!heroId) return setError('Сначала выберите героя.');
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fn();
      await load(heroId);
      getJson('/characters').then(setCharacters).catch(() => {});
      if (okMsg) setNotice(typeof okMsg === 'function' ? okMsg(res) : okMsg);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (error && !view) return <div className="error">{error}</div>;
  if (!view) return <div className="muted center">Загрузка…</div>;

  const clan = view.clan;
  const builtByType = Object.fromEntries((view.holdings || []).map((h) => [h.type, h]));

  return (
    <div>
      <Link to={`/characters/${heroId}`} className="muted">← К герою</Link>
      <HeroTabs characterId={heroId} active="clan" />
      <div className="page-head">
        <h1>⚑ Клан</h1>
        <span className="badge">{hero ? `${hero.name} · ${hero.gold} 🪙` : 'нет героя'}</span>
      </div>

      <div className="card">
        <div className="grid2">
          <div>
            <label className="muted small" htmlFor="clan-hero">Чей клан</label>
            <select id="clan-hero" value={heroId} onChange={(e) => setHeroId(e.target.value)}>
              {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {clan && (
            <div className="muted small">
              <div><b>{clan.name}</b> · {clan.doctrineName}</div>
              <div>Стоянка: {clan.base?.name || '—'} · уровень {clan.level}/{clan.maxLevel} — {clan.levelTitle}</div>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <p className="muted small">✓ {notice}</p>}

      {!clan && <Founding hero={hero} view={view} busy={busy} onFound={(p) => run(() => postJson(`/clan/leader/${heroId}/found`, p), 'Клан основан.')} />}

      {clan && (
        <>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2>{clan.doctrineName}</h2>
                <p className="muted small">{clan.doctrineIdea}</p>
              </div>
              <div className="stat-row small">
                <span>🪙 {clan.gold}</span>
                <span title="имена — валюта памяти">✎ {clan.names}</span>
              </div>
            </div>
            <p className="small">{clan.doctrineDescription}</p>
            <p className="small">Даёт: {clan.doctrineBonuses.join(', ')}. Цена: {clan.doctrinePrice.join(', ')}.</p>
            <p className="small muted">Сейчас от клана: {effectText(clan.effects) || '—'}</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <button type="button" className="btn small" disabled={busy} onClick={() => run(() => postJson(`/clan/leader/${heroId}/names/buy`, { count: 4 }), 'Куплено 4 имени.')}>
                Купить 4 имени ({4 * clan.goldPerName} 🪙)
              </button>
              {clan.nextLevel && (
                <button type="button" className="btn small" disabled={busy} onClick={() => run(() => postJson(`/clan/leader/${heroId}/level`), (r) => `Клан поднялся до уровня ${r.clan.level}.`)}>
                  Поднять уровень: {clan.nextLevel.gold} 🪙 · {clan.nextLevel.names} ✎
                </button>
              )}
              {!clan.nextLevel && <span className="badge safe">высший уровень</span>}
            </div>
          </div>

          <h2>Владения</h2>
          <p className="muted small">
            Ярусы открываются с уровнем клана: ярус 2 — с 3-го уровня, ярус 3 — с 5-го.
            Сейчас клан держит зданий: {view.holdings.length} / {clan.buildingsAllowed}.
          </p>
          <div className="cards">
            {view.allBuildings.map((def) => (
              <BuildingCard
                key={def.type}
                def={def}
                holding={builtByType[def.type]}
                level={clan.level}
                busy={busy}
                onBuild={(type) => run(() => postJson(`/clan/leader/${heroId}/build`, { type }), (r) => `Построено: ${r.holdings.find((h) => h.type === type)?.name || type}.`)}
              />
            ))}
          </div>

          <h2>Наёмники</h2>
          <p className="muted small">Клан держит {clan.mercenaryCount} / {clan.mercenaryCap}. Казарма поднимает предел.</p>
          <div className="cards">
            {view.mercenaries.map((m) => (
              <div className="card" key={m.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Icon src={m.portrait} alt={m.name} size={30} />
                  <span style={{ flex: 1 }}>
                    <b>{m.name}</b>
                    <div className="muted small">{m.className} · ур. {m.level}</div>
                  </span>
                  <span className={`badge${m.dead ? '' : ' safe'}`}>{m.dead ? 'павший' : 'в строю'}</span>
                </div>
                <p className="small muted">{m.history}</p>
                {m.dead && (
                  <button type="button" className="btn small" disabled={busy} onClick={() => run(() => postJson(`/clan/leader/${heroId}/mercenary/${m.id}/revive`), (r) => `${r.mercenary.name} возвращён за ${r.namesCost} имён.`)}>
                    Воскресить ритуалом
                  </button>
                )}
              </div>
            ))}
            {view.mercenaries.length === 0 && <p className="muted">Пока никого не наняли.</p>}
          </div>

          <h3>Нанять</h3>
          <div className="cards">
            {hireable.slice(0, 8).map((c) => (
              <div className="card" key={c.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Icon src={c.portrait} alt={c.name} size={28} />
                  <span style={{ flex: 1 }}>
                    <b>{c.name}</b>
                    <div className="muted small">{c.className} · ур. {c.level}</div>
                  </span>
                  <button type="button" className="btn small" disabled={busy} onClick={() => run(() => postJson(`/clan/leader/${heroId}/hire`, { key: c.key }), (r) => `Нанят: ${r.mercenaries.at(-1)?.name || c.name}.`)}>
                    {c.cost} 🪙
                  </button>
                </div>
              </div>
            ))}
            {hireable.length === 0 && <p className="muted">Некого нанять.</p>}
          </div>

          {garrison && (
            <>
              <h2>Гарнизон</h2>
              <p className="muted small">
                Кто служит клану, ходит в рейды сам и приносит золото, трофеи и имена.
                Доход идёт по часам: раз в {Math.round(garrison.msPerTick / 60000)} мин, до {garrison.goldPerTick} 🪙 за бойца.
                Клан держит {garrison.count} в гарнизоне; взять любого можно в любой миг — но отряд не резиновый, кап «Сбора» держится.
              </p>

              <h3>В гарнизоне</h3>
              <div className="cards">
                {(garrison.members || []).map((m) => (
                  <div className="card" key={m.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Icon src={m.portrait} alt={m.name} size={30} />
                      <span style={{ flex: 1 }}>
                        <b>{m.name}</b>
                        <div className="muted small">{m.className} · ур. {m.level}</div>
                      </span>
                      <button type="button" className="btn small" disabled={busy} onClick={() => run(() => postJson(`/clan/leader/${heroId}/garrison/${m.id}/recall`), `${m.name} возвращается в отряд.`)}>
                        Взять в отряд
                      </button>
                    </div>
                    <p className="small muted">{m.history}</p>
                  </div>
                ))}
                {garrison.count === 0 && <p className="muted">Гарнизон пуст — отправьте кого-нибудь из отряда.</p>}
              </div>

              <h3>Из отряда — в клан</h3>
              <div className="cards">
                {(party?.members || []).filter((m) => m.assignment === 'party').map((m) => (
                  <div className="card" key={m.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Icon src={m.portrait} alt={m.name} size={28} />
                      <span style={{ flex: 1 }}>
                        <b>{m.name}</b>
                        <div className="muted small">{m.className} · ур. {m.level}</div>
                      </span>
                      <button type="button" className="btn small" disabled={busy} onClick={() => run(() => postJson(`/clan/leader/${heroId}/garrison/${m.id}/station`), `${m.name} отряжён в клан.`)}>
                        Отрядить в клан
                      </button>
                    </div>
                  </div>
                ))}
                {(party?.members || []).filter((m) => m.assignment === 'party').length === 0 && (
                  <p className="muted">В отряде никого нет.</p>
                )}
              </div>

              <h3>Сами просятся в клан</h3>
              <p className="muted small">Приходят по часам, если среди клана есть место. Каждого можно принять или отказать — отказ окончательный.</p>
              <div className="cards">
                {petitions.map((p) => (
                  <div className="card" key={p.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Icon src={p.portrait} alt={p.name} size={28} />
                      <span style={{ flex: 1 }}>
                        <b>{p.name}</b>
                        <div className="muted small">{p.className} · ур. {p.level}</div>
                      </span>
                      <button type="button" className="btn small" disabled={busy} onClick={() => run(() => postJson(`/clan/leader/${heroId}/petitions/${p.id}/accept`), `${p.name} принят в клан.`)}>
                        Принять
                      </button>
                      <button type="button" className="btn small ghost" disabled={busy} onClick={() => run(() => postJson(`/clan/leader/${heroId}/petitions/${p.id}/decline`), 'Отказано.')}>
                        Отказать
                      </button>
                    </div>
                    <p className="small muted">{p.history}</p>
                  </div>
                ))}
                {petitions.length === 0 && <p className="muted">Пока никто не просился.</p>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
