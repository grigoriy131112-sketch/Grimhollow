// The survival meters (Wave G3). The server has always computed hunger, thirst
// and fatigue as debuffs, but no screen showed them, so the whole mechanic was
// invisible. This panel surfaces the meters, the tier each has reached and the
// need debuffs currently biting. Shared by the character sheet (read-only) and a
// settlement location (with a rest button).

const TIER_COLOR = {
  fine: '#3f7a3f',
  peckish: '#7a6a2f',
  hungry: '#8a5520',
  starving: '#8a2f2f',
};

export default function SurvivalMeters({ view, onRest, busy = false }) {
  if (!view) return null;
  const needs = view.needs || [];
  return (
    <div className="card">
      <h2>Состояние отряда</h2>
      <p className="muted small">
        Голод, жажда и усталость копятся в дороге и в бою. Изнурённый герой бьёт слабее
        и хуже уклоняется — отдохните в поселении.
      </p>
      <div className="res-bars">
        {needs.map((n) => (
          <div className="res" key={n.need}>
            <div className="small">
              {n.label} {n.value}/100{n.tierLabel ? ` — ${n.tierLabel}` : ''}
            </div>
            <div className="bar">
              <div
                className="fill"
                style={{ width: `${n.value}%`, background: TIER_COLOR[n.tier] || undefined }}
              />
            </div>
          </div>
        ))}
      </div>
      {needs.length === 0 && <p className="muted small">Пока держитесь бодро.</p>}
      {view.needBuffs?.length > 0 && (
        <p className="muted small">
          Тяготы нужды: {view.needBuffs.map((b) => b.label || b.key).join(', ')}
        </p>
      )}
      {onRest && (
        <button type="button" className="btn small" disabled={busy} onClick={onRest}>
          Отдохнуть
        </button>
      )}
    </div>
  );
}
