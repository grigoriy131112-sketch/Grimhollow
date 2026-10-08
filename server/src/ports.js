// Which ports the server binds. The work-host preview exposes two ports; both
// must answer, or one preview URL shows Bad Gateway. PORT is the primary and
// PORT_ALT the second (defaults to 12001 only when PORT is the 12000 preview
// port). PORT_ALT=0 disables the extra listener.
export function resolveListenPorts(env = process.env) {
  const primary = Number(env.PORT || 3001);
  const alt = env.PORT_ALT === undefined
    ? (primary === 12000 ? 12001 : 0)
    : Number(env.PORT_ALT);
  return [...new Set([primary, alt])].filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
}
