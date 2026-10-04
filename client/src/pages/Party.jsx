import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { portraitIcon, classColor, Icon } from '../icons.jsx';
import { statLabel } from '../statLabels.js';
import Talk from '../Talk.jsx';

const REL = (v) => Math.max(0, Math.min(100, v));
const relTone = (v) => (v < 25 ? 'bad' : v < 50 ? 'warn' : 'good');

function Bar({ value }) {
  const v = REL(value);
  return (
    <div className="rel-bar">
      <div className={`rel-fill ${relTone(v)}`} style={{ width: `${v}%` }} />
      <span className="rel-num">{v}%</span>
    </div>
  );
}

function Portrait({ member, size = 64 }) {
  const src = portraitIcon(member);
  const color = classColor(member.class);
  return (
    <div className="portrait" style={{ width: size, height: size, borderColor: color, boxShadow: `0 0 0 2px ${color}22 inset` }}>
      {src ? <Icon src={src} alt={member.name} size={size - 14} /> : <span className="portrait-initial">{member.name?.[0] || '?'}</span>}
    </div>
  );
}

function MemberCard({ member, party }) {
  const [open, setOpen] = useState(false);
  const [talking, setTalking] = useState(false);
  const [relation, setRelation] = useState(member.relationToLeader);
  return (
    <div className={`card member-card ${member.status}`} style={{ borderColor: `${classColor(member.class)}55` }}>
      <div className="member-top">
        <Portrait member={member} />
        <div className="member-id">
          <h3>{member.name}</h3>
          <p className="muted small">{member.className} · {member.level} уровень</p>
          <div className="stat-row small">
            <span>❤️ {member.hp}/{member.stats.maxHp}</span>
            <span>🔮 {member.mana}/{member.stats.maxMana}</span>
            <span>⚡ {member.stamina}/{member.stats.maxStamina}</span>
          </div>
        </div>
      </div>

      <p className="member-history">{member.history}</p>

      <div className="trait-cols">
        <div>
          <div className="trait-head plus">Плюсы</div>
          {member.plus.map((t) => <span key={t.name} className="trait plus" title={t.blurb}>+{t.name}</span>)}
        </div>
        <div>
          <div className="trait-head minus">Минусы</div>
          {member.minus.map((t) => <span key={t.name} className="trait minus" title={t.blurb}>−{t.name}</span>)}
        </div>
      </div>

      <div className="rel-block">
        <div className="rel-row">
          <span className="muted small">Отношение ко мне</span>
          <Bar value={relation} />
        </div>
        <button type="button" className="linklike" onClick={() => setTalking((v) => !v)}>
          {talking ? 'Закончить разговор' : 'Поговорить'}
        </button>
        {talking && <Talk leaderId={party.leader.id} kind="companion" refId={member.id} onClose={() => setTalking(false)} onRelationChange={setRelation} />}
        <button type="button" className="linklike" onClick={() => setOpen((v) => !v)}>
          {open ? 'Скрыть соратников' : `К соратникам (${member.bonds.length})`}
        </button>
        {open && member.bonds.map((b) => (
          <div className="rel-row" key={b.key}>
            <span className="muted small">{b.name}</span>
            <Bar value={b.value} />
          </div>
        ))}
        {member.leaving?.leave && (
          <p className="leaving-warn">⚠ Готов уйти: {member.leaving.reason === 'leader' ? 'отношение ко мне ниже 25%' : 'отношение к соратнику ниже 25%'}</p>
        )}
      </div>
    </div>
  );
}

export default function PartyPage() {
  const { leaderId } = useParams();
  const [party, setParty] = useState(null);
  const [points, setPoints] = useState(null);
  const [fallen, setFallen] = useState(0);
  const [error, setError] = useState('');

  const load = () => Promise.all([
    api.getParty(leaderId),
    api.getPartyPoints(leaderId).catch(() => null),
    api.getRitual(leaderId).catch(() => null),
  ])
    .then(([p, pts, rit]) => { setParty(p); if (pts) setPoints(pts.points); setFallen(rit?.fallen?.length || 0); })
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, [leaderId]);

  if (error && !party) return <div className="error">{error}</div>;
  if (!party) return <div className="muted center">Загрузка…</div>;

  return (
    <div>
      <Link to={`/characters/${leaderId}`} className="muted">← {party.leader.name}</Link>
      <div className="page-head">
        <h1>Отряд</h1>
        <span className="badge">{party.size} спутник(ов) · уход при &lt;{party.leaveThreshold}%</span>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card leader-strip">
        <Portrait member={{ ...party.leader, portrait: null }} size={56} />
        <div>
          <b>{party.leader.name}</b>
          <div className="muted small">Предводитель · {party.leader.className} {party.leader.level} ур. · 💰 {party.leader.gold}</div>
        </div>
        <Link className="btn" to={`/party/${leaderId}/recruit`}>Набрать отряд</Link>
        <Link className="btn ghost" to={`/upgrades/${leaderId}`} title="Очки отряда: дерево усилений">✦ Очки отряда{points != null ? `: ${points}` : ''}</Link>
        <Link className="btn ghost" to={`/resurrection/${leaderId}`} title="Ритуал воскрешения: вернуть павшего из царства мёртвых">🕯 Ритуал{fallen > 0 ? ` · павших ${fallen}` : ''}</Link>
      </div>

      {Object.keys(party.bonuses?.percents || {}).length > 0 && (
        <p className="muted small">
          ✦ Дерево отряда учтено в статах: {Object.entries(party.bonuses.percents).map(([k, v]) => `${statLabel(k)} +${v}%`).join(', ')}
          {party.bonuses.regenMana ? ` · возврат маны +${party.bonuses.regenMana}` : ''}
          {party.bonuses.regenStamina ? ` · возврат выносливости +${party.bonuses.regenStamina}` : ''}
        </p>
      )}

      {party.members.length === 0 ? (
        <div className="card">
          <p className="muted">Отряд пока пуст. Спутников можно найти на дороге, нанять в таверне, спасти или приручить — 14 способов.</p>
          <Link className="btn" to={`/party/${leaderId}/recruit`}>Начать набор</Link>
        </div>
      ) : (
        <div className="cards">
          {party.members.map((m) => <MemberCard key={m.id} member={m} party={party} />)}
        </div>
      )}
    </div>
  );
}
