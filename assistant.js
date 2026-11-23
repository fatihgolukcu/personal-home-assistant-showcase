'use strict';
// Personal Home Assistant — komut anlayıcı.
// 1) Önce kural tabanlı Türkçe eşleştirici (anında, modelsiz).
// 2) Eşleşmezse sunucudaki yerel model (llama.cpp, 127.0.0.1) — JSON şema ile yalnızca izinli niyetleri seçebilir.
// Güvenlik: sunucuyu yeniden başlatma, servis yönetimi, şifre değiştirme sesle/yazıyla YAPILMAZ.
const http = require('http');

const LLM = { host: '127.0.0.1', port: 8081 };

// Türkçe küçük harf + aksan sadeleştirme: "Televizyonu Aç!" → "televizyonu ac"
function norm(s) {
  return String(s || '').toLocaleLowerCase('tr')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .replace(/[’'`´]/g, '').replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const has = (t, re) => re.test(t);

// Niyet → eylem eşlemesi (model de yalnızca bunlardan seçebilir)
const INTENTS = {
  tv_ac: { desc: 'televizyonu aç', run: (A) => A['tv.power_on']({}) },
  tv_kapat: { desc: 'televizyonu kapat / uyut', run: (A) => A['tv.key']({ key: 'sleep' }) },
  ses_ac: { desc: 'TV sesini artır', run: (A, t, n) => repeatKey(A, 'volup', n) },
  ses_kis: { desc: 'TV sesini azalt', run: (A, t, n) => repeatKey(A, 'voldown', n) },
  sessiz: { desc: 'TV sesini kapat/aç (sessize al)', run: (A) => A['tv.key']({ key: 'mute' }) },
  ana_ekran: { desc: 'TV ana ekrana dön', run: (A) => A['tv.key']({ key: 'home' }) },
  geri: { desc: 'TV geri tuşu', run: (A) => A['tv.key']({ key: 'back' }) },
  uygulama_ac: { desc: 'TV’de bir uygulama aç (hedef: uygulama adı)', target: 'app', run: (A, t) => A['tv.app']({ pkg: t.pkg }) },
  radyo_tv: { desc: 'radyoyu TV’de çal', run: (A) => A['radio.cast']({}) },
  radyo_tablet: { desc: 'radyoyu tablette çal', run: (A) => A['radio.tablet']({}) },
  radyo_durdur: { desc: 'radyoyu / yayını durdur', run: (A) => A['radio.stop']({}) },
  kaynak_ps: { desc: 'TV kaynağını PlayStation’a (HDMI 3) çevir', run: (A) => A['tv.input']({ input: 'ps' }) },
  sahne_gunaydin: { desc: 'günaydın sahnesi (TV açılır, radyo çalar)', run: (A) => A['scene.morning']({}) },
  sahne_gece: { desc: 'iyi geceler sahnesi (radyo durur, ekranlar kapanır)', run: (A) => A['scene.night']({}) },
  sahne_cikis: { desc: 'evden çıkış sahnesi', run: (A) => A['scene.away']({}) },
  sahne_sessiz: { desc: 'tüm yayınları durdur', run: (A) => A['scene.quiet']({}) },
  internet_kes: { desc: 'bir cihazın internetini kes (hedef: cihaz adı)', target: 'device', run: (A, t) => A['net.block']({ mac: t.mac }) },
  internet_ac: { desc: 'bir cihazın internetini aç (hedef: cihaz adı)', target: 'device', run: (A, t) => A['net.unblock']({ mac: t.mac }) },
  tablet_uyandir: { desc: 'tableti uyandır', run: (A) => A['tablet.wake']({}) },
  durum: { desc: 'evin durumu nedir', special: 'status' },
  yok: { desc: 'bu bir ev komutu değil / anlaşılmadı', special: 'none' },
};

async function repeatKey(A, key, n) {
  let last;
  for (let i = 0; i < Math.max(1, Math.min(n || 1, 8)); i++) last = await A['tv.key']({ key });
  return last;
}

// ---- hedef sözlükleri (uygulamalar, cihazlar) ----
const APP_ALIASES = {
  'com.netflix.ninja': ['netflix'], 'com.google.android.youtube.tv': ['youtube', 'yutup', 'you tube'],
  'com.amazon.amazonvideo.livingroom': ['prime', 'prime video', 'amazon'], 'com.disney.disneyplus': ['disney', 'disney+', 'disney plus'],
  'com.spotify.tv.android': ['spotify'], 'com.google.android.youtube.tvmusic': ['youtube music', 'youtube muzik'],
  'com.tcl.tv': ['canli tv', 'canli yayin', 'televizyon kanallari', 'kanallar', 'tv kanali'], 'com.phlox.tvwebbrowser': ['tarayici', 'tv bro', 'internet tarayicisi'],
  'com.android.tv.settings': ['ayarlar'], 'bbc.iplayer.android': ['bbc iplayer', 'iplayer'], 'com.apple.atve.androidtv.appletv': ['apple tv'],
};
function appTargets(apps) {
  return apps.map((a) => ({ name: a.name, pkg: a.pkg, keys: [norm(a.name), ...(APP_ALIASES[a.pkg] || [])].filter(Boolean) }));
}
const DEVICE_ALIASES = { tablet: ['64:db:43:1f:d9:b0'], 'tv': ['14:ea:63:0f:f8:e6'], televizyon: ['14:ea:63:0f:f8:e6'], kamera: ['e8:2d:79:9c:88:b3'] };
function deviceTargets(clients) {
  const out = [];
  for (const c of clients) {
    if (c.protected) continue;
    const keys = new Set();
    if (c.name) { keys.add(norm(c.name)); norm(c.name).split(' ').filter((w) => w.length >= 4).forEach((w) => keys.add(w)); }
    for (const [alias, macs] of Object.entries(DEVICE_ALIASES)) if (macs.includes(c.mac)) keys.add(alias);
    if (keys.size) out.push({ name: c.name || c.ip, mac: c.mac, keys: [...keys] });
  }
  return out;
}
function findTarget(t, targets) {
  let best = null;
  for (const x of targets) for (const k of x.keys) {
    if (!k) continue;
    const re = new RegExp(`(^| )${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    if (re.test(t) && (!best || k.length > best.len)) best = { x, len: k.length };
  }
  return best && best.x;
}
const amount = (t) => (has(t, /\b(cok|epey|baya|iyice)\b/) ? 5 : has(t, /\b(biraz|azicik|hafif)\b/) ? 2 : (Number((t.match(/\b([1-8])\b/) || [])[1]) || 3));

// ---- 1) kural tabanlı ----
const FORBIDDEN = /(sunucu|server|bilgisayar|x270).*(yeniden baslat|restart|reboot|kapat|sil)|(yeniden baslat|restart|reboot).*(sunucu|server)|sifre|parola|sudo/;
const CODE = /\b(kod|kodu|kodla|program|yazilim|script|betik|fonksiyon|uygulamayi gelistir|sunucuyu gelistir|gelistir|debug|hata ayikla)\b/;

function ruleMatch(raw, ctx) {
  const t = norm(raw);
  if (!t) return { intent: 'yok' };
  if (FORBIDDEN.test(t)) return { refuse: 'Güvenlik için sunucuyu yeniden başlatma ve şifre işleri sesle yapılmıyor; bunları uygulamanın Ağ sekmesinden yapın.' };
  if (CODE.test(t)) return { code: true };
  const tv = /\b(tv|tvyi|televizyon\w*|ekran)\b/;
  const on = /\b(ac|acar misin|acsana|baslat|calistir|calsin|cal|dinle|koy|ver|gec|goster|getir|yak)\b/;
  const off = /\b(kapat|kapa|uyut|durdur|sustur|kes|engelle|verme|acma|yasakla)\b/;

  if (/\b(hava|saat kac|kimsin|nasilsin|haber|tarif|ceviri|cevir|anlat|nedir|kimdir)\b/.test(t) && !/\b(tv|televizyon|radyo|internet|ses)\b/.test(t))
    return { refuse: 'Ben şimdilik yalnızca ev cihazlarını yönetiyorum (TV, radyo, tablet, internet). Genel sorular için Claude uygulamasını kullanın.' };
  if (/\bgunaydin\b/.test(t)) return { intent: 'sahne_gunaydin' };
  if (/\b(iyi geceler|gece modu|uyuyorum|yatiyorum|yatmaya|uyumaya|yataga)\b/.test(t)) return { intent: 'sahne_gece' };
  if (/\b(evden cik\w*|disari cik\w*|evden ayril\w*|disari gidiyorum)\b/.test(t)) return { intent: 'sahne_cikis' };
  if (/\bher seyi (sustur|durdur|kapat|kes)\b/.test(t)) return { intent: 'sahne_sessiz' };
  if (/\b(durum|neler oluyor|ne durumda|her sey yolunda mi)\b/.test(t)) return { intent: 'durum' };

  if (/\b(internet\w*|baglanti\w*|wifi\w*)\b/.test(t)) {
    const dev = findTarget(t, ctx.devices);
    if (dev && off.test(t)) return { intent: 'internet_kes', target: dev };
    if (dev && (on.test(t) || /\b(geri ver|izin ver)\b/.test(t))) return { intent: 'internet_ac', target: dev };
  }
  if (/\b(playstation|plei ?steyshin|ps ?5|ps ?4|oyun konsolu)\b/.test(t)) return { intent: 'kaynak_ps' };
  if (/\b(radyo\w*|muzi\w*|muzik\w*|sohbet\w*)\b/.test(t)) {
    if (off.test(t)) return { intent: 'radyo_durdur' };
    if (/\btablet\w*\b/.test(t)) return { intent: 'radyo_tablet' };
    return { intent: 'radyo_tv' };
  }
  if (/\b(sesi|ses|sesini|sesine)\b/.test(t)) {
    if (/\b(sessize al|sesi kapat|sesi kes|sustur)\b/.test(t)) return { intent: 'sessiz' };
    if (/\b(cok |fazla )?(yuksek|fazla|patliyor|bagiriyor)\b/.test(t) && !/\b(yukselt|artir|arttir|ac)\b/.test(t)) return { intent: 'ses_kis', n: amount(t) };
    if (/\b(dusuk|az|duyulmuyor|duyamiyorum)\b/.test(t) && !/\b(kis|azalt|dusur)\b/.test(t)) return { intent: 'ses_ac', n: amount(t) };
    if (/\b(ac|yukselt\w*|artir\w*|arttir\w*|yukari|daha yuksek)\b/.test(t)) return { intent: 'ses_ac', n: amount(t) };
    if (/\b(kis\w*|azalt\w*|dusur\w*|asagi|alcalt\w*)\b/.test(t)) return { intent: 'ses_kis', n: amount(t) };
  }
  if (/\b(sessize al|sustur)\b/.test(t)) return { intent: 'sessiz' };
  if (/\bana ?ekran\w*\b/.test(t)) return { intent: 'ana_ekran' };
  if (/^geri( git| don)?$/.test(t)) return { intent: 'geri' };
  const app = findTarget(t, ctx.apps);
  if (app && (on.test(t) || /\b(izle\w*|istiyorum|bakalim|seyret\w*)\b/.test(t) || t.split(' ').length <= 2)) return { intent: 'uygulama_ac', target: app };
  if (/\btablet\w*\b/.test(t) && /\b(uyandir\w*|ac)\b/.test(t)) return { intent: 'tablet_uyandir' };
  if (tv.test(t) && off.test(t)) return { intent: 'tv_kapat' };
  if (tv.test(t) && on.test(t)) return { intent: 'tv_ac' };
  return null;
}

// ---- 2) yerel model ----
function llmRequest(body, timeout = 45000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ ...LLM, path: '/v1/chat/completions', method: 'POST', timeout,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('model geçersiz yanıt verdi')); } });
    });
    req.on('timeout', () => req.destroy(new Error('model zaman aşımı')));
    req.on('error', reject);
    req.end(data);
  });
}
function llmUp() {
  return new Promise((resolve) => {
    const req = http.request({ ...LLM, path: '/health', method: 'GET', timeout: 1500 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}
async function llmMatch(raw, ctx) {
  const intents = Object.keys(INTENTS);
  const targets = ['', ...ctx.apps.map((a) => a.name), ...ctx.devices.map((d) => d.name)];
  // Sistem istemi sabit tutulur → llama.cpp önbelleği (cache_prompt) sayesinde her seferinde yeniden işlenmez
  const sys = 'Sen bir ev asistanısın. Kullanıcının Türkçe isteğini aşağıdaki niyetlerden TEK birine eşle. ' +
    'Emin değilsen veya istek ev cihazlarıyla ilgili değilse "yok" seç. Hedef gerekiyorsa listeden aynen seç, gerekmiyorsa boş bırak.\n' +
    'Niyetler:\n' + intents.map((k) => `- ${k}: ${INTENTS[k].desc}`).join('\n') +
    '\nUygulamalar: ' + ctx.apps.map((a) => a.name).join(', ') +
    '\nCihazlar: ' + ctx.devices.map((d) => d.name).join(', ') +
    '\nÖrnekler: "salondaki televizyonu yak" → tv_ac; "biraz müzik aç" → radyo_tv; "netflixe geç" → uygulama_ac/Netflix; "hava nasıl" → yok.';
  const schema = {
    type: 'object',
    properties: { niyet: { type: 'string', enum: intents }, hedef: { type: 'string', enum: targets } },
    required: ['niyet', 'hedef'],
  };
  const r = await llmRequest({
    messages: [{ role: 'system', content: sys }, { role: 'user', content: String(raw).slice(0, 300) }],
    temperature: 0, max_tokens: 40, cache_prompt: true,
    response_format: { type: 'json_schema', json_schema: { name: 'niyet', schema } },
  });
  const txt = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  let j; try { j = JSON.parse(txt); } catch { return null; }
  if (!INTENTS[j.niyet]) return null;
  const tgt = j.hedef ? (ctx.apps.find((a) => a.name === j.hedef) || ctx.devices.find((d) => d.name === j.hedef)) : null;
  return { intent: j.niyet, target: tgt || null };
}

// ---- ana giriş ----
function createAssistant({ ACTIONS, tvApps, statusFn }) {
  let clientsCache = { t: 0, list: [] };
  async function context() {
    let apps = [], devices = [];
    try { apps = appTargets(await tvApps(false)); } catch {}
    try {
      if (Date.now() - clientsCache.t > 60000) { const r = await ACTIONS['net.clients']({}); if (r && r.clients) clientsCache = { t: Date.now(), list: r.clients }; }
      devices = deviceTargets(clientsCache.list);
    } catch {}
    return { apps, devices };
  }
  async function ask(text) {
    const started = Date.now();
    const raw = String(text || '').trim().slice(0, 300);
    if (!raw) return { ok: false, msg: 'Boş komut' };
    const ctx = await context();
    let m = ruleMatch(raw, ctx), via = 'kural';
    if (m && m.refuse) return { ok: false, verified: false, via, msg: m.refuse };
    if (m && m.code) return { ok: true, verified: null, via, code: true, msg: 'Kod yazma ve sunucu geliştirme için Claude Code’u kullanın (Ev ekranındaki “Geliştirici” kartı).' };
    if (!m) {
      if (!(await llmUp())) return { ok: false, verified: false, via: 'yok', msg: 'Anlayamadım. (Yerel model kapalı; “TV’yi aç”, “radyoyu aç”, “sesi kıs” gibi söyleyin.)' };
      via = 'model';
      try { m = await llmMatch(raw, ctx); } catch (e) { return { ok: false, verified: false, via, msg: 'Model yanıt vermedi: ' + e.message }; }
      if (!m) return { ok: false, verified: false, via, msg: 'Anlayamadım, başka şekilde söyler misiniz?' };
    }
    const it = INTENTS[m.intent];
    if (!it || m.intent === 'yok') return { ok: false, verified: false, via, msg: 'Bunu bir ev komutu olarak anlayamadım.' };
    if (it.special === 'status') {
      const s = await statusFn();
      const p = [`TV ${s.tv.awake ? 'açık' : s.tv.awake === false ? 'kapalı' : 'bilinmiyor'}`,
        `tablet ${s.tablet.adb === 'device' ? 'bağlı' : 'bağlı değil'}${s.tablet.battery ? `, pil %${s.tablet.battery.level}` : ''}`,
        `sunucu ${s.link && s.link.active === 'wifi' ? 'Wi‑Fi’de' : 'kabloda'}`, `Home Assistant ${s.ha && s.ha.up ? 'çalışıyor' : 'kapalı'}`];
      return { ok: true, verified: true, via, intent: m.intent, msg: p.join(', ') + '.', ms: Date.now() - started };
    }
    if (it.target && !m.target) return { ok: false, verified: false, via, msg: it.target === 'app' ? 'Hangi uygulama?' : 'Hangi cihaz?' };
    // Model küçük ve yanılabilir: modelden gelen her eylem önce onaylatılır (kurallar doğrudan çalışır)
    if (via === 'model') {
      const id = Math.random().toString(36).slice(2, 10);
      pending = { id, m, exp: Date.now() + 90000 };
      return { ok: true, verified: null, via, intent: m.intent, confirm: { id }, ms: Date.now() - started,
        msg: `Şunu mu yapayım: ${it.desc}${m.target ? ' — ' + m.target.name : ''}?` };
    }
    return run(m, via, started);
  }
  let pending = null;
  async function run(m, via, started) {
    const r = await INTENTS[m.intent].run(ACTIONS, m.target || {}, m.n);
    return { ...r, via, intent: m.intent, target: m.target ? m.target.name : undefined, ms: Date.now() - started };
  }
  async function confirm(id, yes) {
    const p = pending;
    pending = null;
    if (!p || p.id !== id || Date.now() > p.exp) return { ok: false, verified: false, msg: 'Onay süresi doldu, komutu tekrar söyleyin.' };
    if (!yes) return { ok: true, verified: null, msg: 'Tamam, vazgeçtim.' };
    return run(p.m, 'model', Date.now());
  }
  // Açılışta modeli bir kez çalıştır: sabit sistem istemi önbelleğe girer, ilk gerçek komut hızlı olur
  async function warm() { try { if (await llmUp()) await llmMatch('televizyonu aç', await context()); } catch {} }
  return { ask, confirm, warm, llmUp, ruleMatch: (t) => context().then((c) => ruleMatch(t, c)), norm };
}

module.exports = { createAssistant, norm };
