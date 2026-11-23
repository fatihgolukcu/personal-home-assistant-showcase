'use strict';
// Uygulama içi oynatıcı: TV ve tablet uygulamaları sunucuyu uzun-yoklama ile dinler; komut gelince kendi içlerinde çalar.
function createPlayer() {
  const roles = ['tv', 'tablet'];
  const q = { tv: [], tablet: [] }, w = { tv: [], tablet: [] }, seen = {};
  const online = (r) => Date.now() - (seen[r] || 0) < 45000;
  function poll(role, ms = 25000) {
    if (!roles.includes(role)) throw new Error('geçersiz oynatıcı');
    seen[role] = Date.now();
    if (q[role].length) return Promise.resolve(q[role].splice(0));
    return new Promise((resolve) => {
      let t;
      const done = (cmds) => { clearTimeout(t); w[role] = w[role].filter((x) => x !== done); seen[role] = Date.now(); resolve(cmds); };
      t = setTimeout(() => done([]), ms);
      w[role].push(done);
    });
  }
  function send(role, cmd) {
    if (!online(role)) return false;
    q[role].push(cmd);
    while (w[role].length && q[role].length) w[role].shift()(q[role].splice(0));
    return true;
  }
  return { poll, send, online, roles, stopAll() { for (const r of roles) if (online(r)) send(r, { cmd: 'stop' }); }, status() { return { tv: online('tv'), tablet: online('tablet') }; } };
}
module.exports = { createPlayer };
