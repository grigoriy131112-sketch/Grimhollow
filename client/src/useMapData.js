import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const LAST_HERO_KEY = 'grimhollow.map.hero';

// The atlas data, shared by the world page and the codex. Remembers the last
// hero the player looked through and keeps the map fresh so a walking party's
// marker moves.
export function useMapData({ poll = true } = {}) {
  const [map, setMap] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [heroId, setHeroId] = useState(() => localStorage.getItem(LAST_HERO_KEY) || '');
  const [error, setError] = useState('');

  useEffect(() => {
    api.listCharacters().then((list) => {
      setCharacters(list);
      setHeroId((prev) => {
        const ok = list.some((c) => String(c.id) === prev);
        const next = ok ? prev : (list.length ? String(list[0].id) : '');
        if (next) localStorage.setItem(LAST_HERO_KEY, next);
        return next;
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => api.getMap(heroId ? Number(heroId) : undefined)
      .then((m) => { if (alive) setMap(m); })
      .catch((e) => { if (alive) setError(e.message); });
    load();
    if (!poll || !heroId) return () => { alive = false; };
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [heroId, poll]);

  const pickHero = useCallback((id) => {
    setHeroId(id);
    if (id) localStorage.setItem(LAST_HERO_KEY, id);
  }, []);

  return { map, characters, heroId, pickHero, error };
}
