import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { statLabel } from '../statLabels.js';
import HeroTabs from '../HeroTabs.jsx';

// One node in the tree: its rank, cost and a button to forge the next rank.
function Node({ node, points, onSpend, busy }) {
  const affordable = points >= node.nextCost;
  const ready = node.canTake;
  const state = node.maxed ? 'maxed' : ready ? 'ready' : 'locked';
  return (
    <div className={`upg-node ${state}`}>
      <div className="upg-node-top">
        <b>{node.name}</b>
        <span className="upg-rank">{node.rank}/{node.maxRank}</span>
      </div>
      <p className="muted small">{node.blurb}</p>
      <div className="upg-node-foot">
        <span className="upg-cost" title={`Стоимость ранга ${node.rank + 1} (дороже с каждым рангом)`}>
          {node.maxed ? 'выковано' : `✦ ${node.nextCost}`}
        </span>
        {!node.maxed && (
          <button
            type="button"
            className="btn small"
            disabled={!ready || !affordable || busy}
            title={node.reason || (!affordable ? 'Не хватает Очков отряда.' : '')}
            onClick={() => onSpend(node.key)}
          >
            Выковать
          </button>
        )}
      </div>
      {node.reason && !node.maxed && <p className="upg-reason small">{node.reason}</p>}
    </div>
  );
}

export default function UpgradesPage() {
  const { leaderId } = useParams();
  const [tree, setTree] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.getUpgrades(leaderId).then(setTree).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [leaderId]);

  const spend = async (node) => {
    setBusy(true);
    setError('');
    try { setTree(await api.spendUpgrade(leaderId, node)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (error && !tree) return <div className="error">{error}</div>;
  if (!tree) return <div className="muted center">Загрузка…</div>;

  return (
    <div>
      <Link to={`/party/${leaderId}`} className="muted">← Отряд</Link>
      <HeroTabs characterId={leaderId} active="camp" />
      <div className="page-head">
        <h1>Очки отряда</h1>
        <span className="badge" title="Свободные / потраченные / всего">
          ✦ {tree.points} свободно · {tree.spentPoints} вложено · {tree.totalPoints} на всё
        </span>
      </div>
      {error && <div className="error">{error}</div>}

      <p className="muted small">
        Очки отряда капают за победы в бою и за каждый новый уровень предводителя.
        Вложите их в ветви ниже — они усиливают весь отряд, а не одного героя.
      </p>

      <div className="cards">
        {tree.branches.map((branch) => (
          <div className="card" key={branch.key}>
            <h2 className="upg-branch-name">{branch.name}</h2>
            <p className="muted small">{branch.blurb}</p>
            <div className="upg-nodes">
              {branch.nodes.map((n) => (
                <Node key={n.key} node={n} points={tree.points} onSpend={spend} busy={busy} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Что даёт дерево сейчас</h3>
        <div className="stat-row small">
          <span>Размер отряда: {tree.bonuses.roster}</span>
          <span>Возврат маны: +{tree.bonuses.regenMana}</span>
          <span>Возврат выносливости: +{tree.bonuses.regenStamina}</span>
          {tree.bonuses.startFull && <span>Бой с полным запасом сил</span>}
        </div>
        <div className="stat-row small">
          {Object.entries(tree.bonuses.percents).map(([stat, pct]) => (
            <span key={stat}>{statLabel(stat)}: +{pct}%</span>
          ))}
        </div>
      </div>
    </div>
  );
}
