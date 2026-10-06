import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

// The Lore page (Wave W-MENU). The canon is authored as Markdown under
// docs/lore/ and served already parsed into typed blocks, so nothing here
// renders raw HTML.

// Only **bold** is used in the canon; render it without dangerouslySetInnerHTML.
function Inline({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) => (
    p.startsWith('**') && p.endsWith('**')
      ? <b key={i}>{p.slice(2, -2)}</b>
      : <span key={i}>{p}</span>
  ));
}

function Blocks({ blocks }) {
  return blocks.map((b, i) => {
    if (b.t === 'h') return <h3 key={i}><Inline text={b.text} /></h3>;
    if (b.t === 'li') return <li key={i}><Inline text={b.text} /></li>;
    if (b.t === 'p') return <p key={i}><Inline text={b.text} /></p>;
    if (b.t === 'table') {
      return (
        <table className="lore-table" key={i}>
          <tbody>
            {b.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (r === 0 ? <th key={c}><Inline text={cell} /></th> : <td key={c}><Inline text={cell} /></td>))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return null;
  });
}

export default function LorePage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const [index, setIndex] = useState([]);
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listLore().then(setIndex).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!key) { setDoc(null); return; }
    let alive = true;
    api.getLore(key)
      .then((d) => { if (alive) setDoc(d); })
      .catch((e) => { if (alive) { setError(e.message); navigate('/lore', { replace: true }); } });
    return () => { alive = false; };
  }, [key, navigate]);

  if (error) return <div className="error">{error}</div>;

  if (!key) {
    return (
      <div>
        <div className="page-head">
          <h1>Лор</h1>
          <span className="badge">канон мира</span>
        </div>
        <p className="muted">Единственный источник правды по миру. Дополнять — не переписывать.</p>
        <div className="cards">
          {index.map((d) => (
            <Link className="card lore-card" key={d.key} to={`/lore/${d.key}`}>
              <h3>{d.title}</h3>
              <p className="muted small">{d.blurb}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (!doc) return <div className="muted center">Загрузка…</div>;

  return (
    <div>
      <Link to="/lore" className="muted">← Лор</Link>
      <div className="page-head">
        <h1>{doc.title}</h1>
        <span className="badge">{doc.sections.length} разделов</span>
      </div>
      <p className="muted">{doc.blurb}</p>
      <div className="lore-body">
        {doc.sections.map((s) => (
          <section className="card" key={s.key}>
            <h2>{s.title}</h2>
            <Blocks blocks={s.blocks} />
          </section>
        ))}
      </div>
    </div>
  );
}
