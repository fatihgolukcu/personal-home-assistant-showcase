'use strict';
// GL.iNet 4.x (GL-MT3000) JSON-RPC istemcisi. Şifre secrets/glinet.pass dosyasından okunur, hiçbir yere yazılmaz.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ---- sha256-crypt ($5$), glibc/Ulrich Drepper algoritması (yalnızca 5000 tur, varsayılan) ----
const B64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function sha256(...parts) { const h = crypto.createHash('sha256'); for (const p of parts) h.update(p); return h.digest(); }
function sha256crypt(password, salt, rounds = 5000) {
  const P = Buffer.from(password, 'utf8');
  const S = Buffer.from(salt.slice(0, 16), 'utf8');
  const B = sha256(P, S, P);
  const a = crypto.createHash('sha256'); a.update(P); a.update(S);
  let n = P.length;
  for (; n > 32; n -= 32) a.update(B);
  a.update(B.subarray(0, n));
  for (let i = P.length; i > 0; i >>= 1) a.update(i & 1 ? B : P);
  let A = a.digest();
  const dp = crypto.createHash('sha256'); for (let i = 0; i < P.length; i++) dp.update(P);
  const DP = dp.digest();
  const Pseq = Buffer.alloc(P.length); for (let i = 0; i < P.length; i++) Pseq[i] = DP[i % 32];
  const ds = crypto.createHash('sha256'); for (let i = 0; i < 16 + A[0]; i++) ds.update(S);
  const DS = ds.digest();
  const Sseq = Buffer.alloc(S.length); for (let i = 0; i < S.length; i++) Sseq[i] = DS[i % 32];
  let C = A;
  for (let i = 0; i < rounds; i++) {
    const c = crypto.createHash('sha256');
    c.update(i & 1 ? Pseq : C);
    if (i % 3) c.update(Sseq);
    if (i % 7) c.update(Pseq);
    c.update(i & 1 ? C : Pseq);
    C = c.digest();
  }
  const order = [[0,10,20],[21,1,11],[12,22,2],[3,13,23],[24,4,14],[15,25,5],[6,16,26],[27,7,17],[18,28,8],[9,19,29]];
  let out = '';
  const enc = (b2, b1, b0, n) => { let w = (b2 << 16) | (b1 << 8) | b0; for (let i = 0; i < n; i++) { out += B64[w & 63]; w >>= 6; } };
  for (const [x, y, z] of order) enc(C[x], C[y], C[z], 4);
  enc(0, C[31], C[30], 3);
  return `$5$${salt.slice(0, 16)}$${out}`;
}

// ---- RPC ----
const HOST = process.env.GL_HOST || '192.168.8.1';
const PASS_FILE = path.join(__dirname, 'secrets', 'glinet.pass');
let sid = null;

function rpc(method, params, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params });
    const req = http.request({ host: HOST, port: 80, path: '/rpc', method: 'POST', timeout,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('modem geçersiz yanıt verdi')); } });
    });
    req.on('timeout', () => req.destroy(new Error('modem yanıt vermedi')));
    req.on('error', reject);
    req.end(body);
  });
}
function havePassword() { try { return fs.readFileSync(PASS_FILE, 'utf8').length > 0; } catch { return false; } }
async function login(pwOverride) {
  let pw = pwOverride;
  if (pw === undefined) {
    try { pw = fs.readFileSync(PASS_FILE, 'utf8').replace(/\r?\n$/, ''); } catch { throw new Error('modem şifresi kayıtlı değil (secrets/glinet.pass)'); }
  }
  const ch = await rpc('challenge', { username: 'root' });
  if (!ch.result) throw new Error('modem girişi başlatılamadı');
  const { salt, nonce, alg } = ch.result;
  if (alg !== 5) throw new Error('beklenmeyen şifreleme türü: ' + alg);
  const cipher = sha256crypt(pw, salt);
  const hash = sha256(`root:${cipher}:${nonce}`).toString('hex');
  const r = await rpc('login', { username: 'root', hash });
  if (!r.result || !r.result.sid) throw new Error('modem şifresi kabul edilmedi');
  sid = r.result.sid;
  return sid;
}
async function call(module, method, params = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!sid) await login();
    const r = await rpc('call', [sid, module, method, params]);
    if (r.error && (r.error.code === -32000 || /denied|session/i.test(r.error.message || ''))) { sid = null; continue; }
    if (r.error) throw new Error(`modem: ${r.error.message || 'hata'} (${module}.${method})`);
    return r.result;
  }
  throw new Error('modem oturumu açılamadı');
}

// Verilen şifre modemde çalışıyorsa dosyaya kaydeder (0600). Çalışmıyorsa hiçbir şey yazmaz.
async function setPassword(pw) {
  await login(pw); // yanlışsa hata fırlatır
  fs.mkdirSync(path.dirname(PASS_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(PASS_FILE + '.tmp', pw, { mode: 0o600 });
  fs.renameSync(PASS_FILE + '.tmp', PASS_FILE);
  return true;
}

module.exports = { sha256crypt, call, login, havePassword, setPassword, HOST };
