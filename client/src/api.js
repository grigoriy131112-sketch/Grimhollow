async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  getOptions: () => request('GET', '/characters/options'),
  listCharacters: () => request('GET', '/characters'),
  getCharacter: (id) => request('GET', `/characters/${id}`),
  createCharacter: (payload) => request('POST', '/characters', payload),
  deleteCharacter: (id) => request('DELETE', `/characters/${id}`),
  getWorld: () => request('GET', '/world'),
  getMap: () => request('GET', '/world/map'),
  getLocation: (id) => request('GET', `/world/locations/${id}`),
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
};
