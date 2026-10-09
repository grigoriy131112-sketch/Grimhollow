const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A GET is safe to retry, and the preview frequently comes back a moment late:
// the sandbox forwards a request while the server is still starting after an
// idle stop. Retrying a GET a few times turns that cold-start blink into a short
// wait instead of "Failed to fetch". Writes (POST/PUT/DELETE) are never retried,
// so a mutation cannot be applied twice.
async function request(method, path, body) {
  const maxTries = method === 'GET' ? 4 : 1;
  let lastError;
  for (let attempt = 1; attempt <= maxTries; attempt += 1) {
    let res;
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      lastError = new Error('Сервер просыпается, подождите секунду…');
      if (attempt < maxTries) { await sleep(400 * attempt); continue; }
      throw lastError;
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Запрос не удался (${res.status})`);
    return data;
  }
  throw lastError;
}

export const api = {
  getOptions: () => request('GET', '/characters/options'),
  listCharacters: () => request('GET', '/characters'),
  getCharacter: (id) => request('GET', `/characters/${id}`),
  createCharacter: (payload) => request('POST', '/characters', payload),
  deleteCharacter: (id) => request('DELETE', `/characters/${id}`),
  getWorld: () => request('GET', '/world'),
  getMap: (characterId) => request('GET', `/world/map${characterId ? `?characterId=${characterId}` : ''}`),
  getContinent: (idOrName) => request('GET', `/continents/${encodeURIComponent(idOrName)}`),
  getGates: () => request('GET', '/continents/gates'),
  getCrossings: (locationId, characterId) => request(
    'GET', `/continents/locations/${locationId}/crossings${characterId ? `?characterId=${characterId}` : ''}`,
  ),
  startCrossing: (payload) => request('POST', '/continents/cross', payload),
  visitLocation: (id, characterId) => request('POST', `/world/locations/${id}/visit`, { characterId }),
  getLocation: (id) => request('GET', `/world/locations/${id}`),
  getItems: (characterId) => request('GET', `/world/characters/${characterId}/items`),
  listMonsters: () => request('GET', '/world/monsters'),
  startBattle: (payload) => request('POST', '/battles', payload),
  getBattle: (id) => request('GET', `/battles/${id}`),
  preview: (id, abilityId, targetKey) =>
    request('GET', `/battles/${id}/preview?abilityId=${abilityId}&targetKey=${targetKey}`),
  battleAction: (id, action) => request('POST', `/battles/${id}/action`, action),
  getParty: (leaderId) => request('GET', `/party/${leaderId}`),
  getSources: (leaderId) => request('GET', `/party/${leaderId}/sources`),
  getRecruits: (leaderId, source) => request('GET', `/party/${leaderId}/recruits${source ? `?source=${source}` : ''}`),
  recruit: (leaderId, payload) => request('POST', `/party/${leaderId}/recruit`, payload),
  adjustRelation: (memberId, payload) => request('POST', `/party/member/${memberId}/relation`, payload),
  sweepParty: (leaderId) => request('POST', `/party/${leaderId}/sweep`),
  setMemberStatus: (memberId, status) => request('POST', `/party/member/${memberId}/status`, { status }),
  getUpgrades: (leaderId) => request('GET', `/upgrades/${leaderId}`),
  getPartyPoints: (leaderId) => request('GET', `/upgrades/${leaderId}/points`),
  spendUpgrade: (leaderId, node) => request('POST', `/upgrades/${leaderId}/spend`, { node }),
  getShip: (characterId) => request('GET', `/ship/${characterId}`),
  buyShip: (characterId, name) => request('POST', `/ship/${characterId}/buy`, { name }),
  shipUpgrade: (characterId, payload) => request('POST', `/ship/${characterId}/upgrade`, payload),
  startNavalBattle: (characterId, payload) => request('POST', `/naval/${characterId}/battle`, payload),
  getNavalBattle: (id) => request('GET', `/naval/battle/${id}`),
  navalPreview: (id, action, abilityId) =>
    request('GET', `/naval/battle/${id}/preview?action=${action || 'broadside'}${abilityId ? `&abilityId=${abilityId}` : ''}`),
  navalAction: (id, action) => request('POST', `/naval/battle/${id}/action`, { action }),
  fleeNaval: (id) => request('POST', `/naval/battle/${id}/flee`),
  getPapers: (characterId) => request('GET', `/naval/${characterId}/papers`),
  savePapers: (characterId, notes) => request('POST', `/naval/${characterId}/papers`, { notes }),
  startVoyage: (characterId, payload) => request('POST', `/naval/${characterId}/voyage`, payload),
  getVoyage: (characterId) => request('GET', `/naval/${characterId}/voyage`),
  resolveVoyage: (characterId) => request('POST', `/naval/${characterId}/voyage/resolve`),
  dialogueOptions: () => request('GET', '/dialogue/options'),
  dialogueStatus: () => request('GET', '/dialogue/status'),
  npcsAtLocation: (locationId) => request('GET', `/dialogue/npc/${locationId}`),
  getConversation: (leaderId, kind, refId) => request('GET', `/dialogue/${leaderId}/${kind}/${refId}`),
  say: (leaderId, kind, refId, text) => request('POST', `/dialogue/${leaderId}/${kind}/${refId}`, { text }),
  startTravel: (payload) => request('POST', '/travel', payload),
  getTravel: (id) => request('GET', `/travel/${id}`),
  chooseTravel: (id, choice) => request('POST', `/travel/${id}/choose`, { choice }),
  getRitual: (leaderId) => request('GET', `/resurrections/${leaderId}`),
  startResurrection: (leaderId, memberId) => request('POST', `/resurrections/${leaderId}/start`, { memberId }),
  listSaves: (characterId) => request('GET', `/saves/${characterId}`),
  listAllSaves: () => request('GET', '/saves/all'),
  createSave: (characterId, name) => request('POST', `/saves/${characterId}`, { name }),
  loadSave: (saveId) => request('POST', `/saves/slot/${saveId}/load`),
  deleteSave: (saveId) => request('DELETE', `/saves/slot/${saveId}`),
  exportSave: (saveId) => request('GET', `/saves/slot/${saveId}/export`),
  getInventory: (characterId) => request('GET', `/items/${characterId}`),
  equipItem: (characterId, key) => request('POST', `/items/${characterId}/equip`, { key }),
  unequipItem: (characterId, slot) => request('POST', `/items/${characterId}/unequip`, { slot }),
  useItem: (characterId, key) => request('POST', `/items/${characterId}/use`, { key }),
  removeBuff: (characterId, payload) => request('DELETE', `/items/${characterId}/buffs`, payload),
  tickBuffs: (characterId, turns = 1) => request('POST', `/items/${characterId}/buffs/tick`, { turns }),
  listLore: () => request('GET', '/lore'),
  getLore: (key) => request('GET', `/lore/${key}`),
};
