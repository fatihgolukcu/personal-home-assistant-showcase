'use strict';
// Personal Home Assistant: telefondan TV, tablet, modem ve sunucuyu yöneten küçük web uygulaması.
// Bağımlılık: yalnızca castv2-client. Kimlik doğrulama: PIN + imzalı çerezli oturum.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const os = require('os');
const dgram = require('dgram');
const { execFile } = require('child_process');
const gl = require('./glinet');
const { Client, DefaultMediaReceiver, Application, RequestResponseController } = require('castv2-client');

const ROOT = __dirname;
const CFG_FILE = path.join(ROOT, 'config.json');
const SCH_FILE = path.join(ROOT, 'schedule.json');
const ADB = path.join(process.env.HOME, 'tools/platform-tools/adb');

// ---------- ayarlar ----------
const DEFAULTS = {
  port: 8765,
  pin: null,
  secret: null,
  tv: { ip: '192.168.1.20', adbPort: 5555 },
  tablet: { ip: '192.168.1.21', adbPort: 5555 },
  streamUrl: 'https://example.com/stream.mp3', // set your own radio stream in config.json
  radioPage: 'https://example.com/radio',
  tvBroPkg: 'com.phlox.tvwebbrowser',
  browserPkgTablet: 'acr.browser.lightning',
};
function loadJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } }
function saveJson(f, o) { fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 2), { mode: 0o600 }); fs.renameSync(f + '.tmp', f); }
const cfg = Object.assign({}, DEFAULTS, loadJson(CFG_FILE, {}));
let dirty = false;
if (!cfg.pin) { cfg.pin = String(crypto.randomInt(100000, 1000000)); dirty = true; }
if (!cfg.secret) { cfg.secret = crypto.randomBytes(32).toString('hex'); dirty = true; }
if (!cfg.tz) { cfg.tz = 'UTC'; dirty = true; }
if (!cfg.mediaToken) { cfg.mediaToken = crypto.randomBytes(12).toString('hex'); dirty = true; }
if (!cfg.apkToken) { cfg.apkToken = crypto.randomBytes(12).toString('hex'); dirty = true; }
if (dirty) saveJson(CFG_FILE, cfg);
let schedule = loadJson(SCH_FILE, []);

const TV = `${cfg.tv.ip}:${cfg.tv.adbPort}`;
const TABLET = `${cfg.tablet.ip}:${cfg.tablet.adbPort}`;
const WIFI = { tv: TV, tablet: TABLET };
// Tablet sunucuya USB ile takılıysa adb USB üzerinden konuşulur (ağ gerekmez, tablet şarj olur, daha güvenilir);
// takılı değilse Wi‑Fi adresine düşülür.
const USB_SERIAL = cfg.tablet.usbSerial || 'HA0R1CVF';

// ---------- adb ----------
function run(cmd, args, timeout = 15000) {
  return new Promise((res) => execFile(cmd, args, { timeout }, (e, so, se) =>
    res({ ok: !e, out: String(so || '').trim(), err: String(se || (e && e.message) || '').trim() })));
}
let devCache = { t: 0, list: {} };
async function adbList() {
  if (Date.now() - devCache.t < 4000) return devCache.list;
  const r = await run(ADB, ['devices'], 6000);
  const list = {};
  for (const l of r.out.split('\n').slice(1)) { const m = /^(\S+)\s+(\S+)/.exec(l); if (m) list[m[1]] = m[2]; }
  devCache = { t: Date.now(), list };
  return list;
}
async function devId(dev) {
  if (dev === 'tablet' && (await adbList())[USB_SERIAL] === 'device') return USB_SERIAL;
  return WIFI[dev];
}
const adb = async (dev, args, t) => run(ADB, ['-s', await devId(dev), ...args], t);
const sh = (dev, cmd, t) => adb(dev, ['shell', cmd], t);
async function adbState(dev) {
  const r = await run(ADB, ['-s', await devId(dev), 'get-state'], 5000);
  return r.ok ? r.out : 'offline';
}
let lastTcpip = 0;
async function reconnectLoop() {
  devCache.t = 0;
  const list = await adbList();
  for (const dev of ['tv', 'tablet']) {
    const w = WIFI[dev];
    if (dev === 'tablet' && list[USB_SERIAL] === 'device') {
      // USB varken Wi‑Fi yedeğini hazır tut: bayat girdiyi temizle, olmazsa tabletin TCP modunu (en çok 10 dakikada bir) yeniden aç
      if (list[w] !== 'device') {
        if (list[w]) await run(ADB, ['disconnect', w], 4000);
        let c = await run(ADB, ['connect', w], 8000);
        if (!/connected to/.test(c.out) && Date.now() - lastTcpip > 600000) {
          lastTcpip = Date.now();
          await run(ADB, ['-s', USB_SERIAL, 'tcpip', String(cfg.tablet.adbPort)], 8000);
          await sleep(3000);
          await run(ADB, ['connect', w], 8000);
        }
      }
      continue;
    }
    if (list[w] !== 'device') {
      if (list[w]) await run(ADB, ['disconnect', w], 4000); // bayat “offline” girdiyi temizle
      await run(ADB, ['connect', w], 8000);
    }
  }
  devCache.t = 0;
}
setInterval(reconnectLoop, 30000);
reconnectLoop();

// ---------- Cast ----------
class DashCast extends Application {
  constructor(client, session) {
    super(client, session);
    this.dash = this.createController(RequestResponseController, 'urn:x-cast:es.offd.dashcast', 'JSON');
  }
  // DashCast mesaja cevap vermez, bu yüzden request yerine send kullanıyoruz.
  sendUrl(url, cb) {
    this.dash.send({ url, force: true, reload: false, reload_time: 0 });
    setTimeout(() => cb(null), 1500);
  }
}
DashCast.APP_ID = '84912283';

function withCast(fn) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    let done = false;
    const fin = (e, v) => {
      if (done) return; done = true; clearTimeout(to);
      try { c.close(); } catch {}
      e ? reject(e) : resolve(v);
    };
    const to = setTimeout(() => fin(new Error('TV yanıt vermedi (kapalı veya beklemede olabilir)')), 20000);
    c.on('error', (e) => fin(e));
    c.connect(cfg.tv.ip, () => fn(c, fin));
  });
}
const castRadio = () => withCast((c, fin) => c.launch(DefaultMediaReceiver, (e, p) => {
  if (e) return fin(e);
  p.load({
    contentId: cfg.streamUrl, contentType: 'audio/mpeg', streamType: 'LIVE',
    metadata: { type: 0, metadataType: 3, title: 'Radio', artist: 'Live' },
  }, { autoplay: true }, (e2) => fin(e2));
}));
// Herhangi bir ses/video adresini TV'de Chromecast ile çal (Arapça dosya adları için adres kodlanır)
const castMedia = (url, contentType = 'audio/mpeg', title = 'Personal Home Assistant', live = false) => withCast((c, fin) => c.launch(DefaultMediaReceiver, (e, p) => {
  if (e) return fin(e);
  p.load({
    contentId: encodeURI(decodeURI(url)), contentType, streamType: live ? 'LIVE' : 'BUFFERED',
    metadata: { type: 0, metadataType: 3, title, artist: 'Personal Home Assistant' },
  }, { autoplay: true }, (e2) => fin(e2));
}));
const castSetVolume = (level) => withCast((c, fin) => c.setVolume({ level }, (e) => fin(e)));
const castPage = (url) => withCast((c, fin) => c.launch(DashCast, (e, app) => {
  if (e) return fin(e);
  app.sendUrl(url, (e2) => fin(e2));
}));
const castStop = () => withCast((c, fin) => c.getSessions((e, sessions) => {
  if (e) return fin(e);
  const s = (sessions || []).filter((x) => x.appId !== 'E8C28D3C'); // ana ekranı kapatma
  if (!s.length) return fin(null);
  let left = s.length;
  s.forEach((x) => c.receiver.stop(x.sessionId, () => { if (--left === 0) fin(null); }));
}));
const castVolume = (delta) => withCast((c, fin) => c.getVolume((e, v) => {
  if (e) return fin(e);
  const level = Math.max(0, Math.min(1, (v.level ?? 0.3) + delta));
  c.setVolume({ level }, (e2) => fin(e2, level));
}));
function tcpOpen(host, port, t = 1200) {
  return new Promise((res) => {
    const s = net.connect({ host, port, timeout: t });
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('timeout', () => { s.destroy(); res(false); });
    s.on('error', () => res(false));
  });
}

// ---------- eylemler ----------
const KEYS = {
  up: 'KEYCODE_DPAD_UP', down: 'KEYCODE_DPAD_DOWN', left: 'KEYCODE_DPAD_LEFT', right: 'KEYCODE_DPAD_RIGHT',
  ok: 'KEYCODE_DPAD_CENTER', back: 'KEYCODE_BACK', home: 'KEYCODE_HOME', menu: 'KEYCODE_MENU',
  volup: 'KEYCODE_VOLUME_UP', voldown: 'KEYCODE_VOLUME_DOWN', mute: 'KEYCODE_VOLUME_MUTE',
  playpause: 'KEYCODE_MEDIA_PLAY_PAUSE', stop: 'KEYCODE_MEDIA_STOP', wake: 'KEYCODE_WAKEUP', sleep: 'KEYCODE_SLEEP',
  recents: 'KEYCODE_APP_SWITCH', enter: 'KEYCODE_ENTER',
  // TCL kumandasındaki diğer tuşlar
  n0: 'KEYCODE_0', n1: 'KEYCODE_1', n2: 'KEYCODE_2', n3: 'KEYCODE_3', n4: 'KEYCODE_4',
  n5: 'KEYCODE_5', n6: 'KEYCODE_6', n7: 'KEYCODE_7', n8: 'KEYCODE_8', n9: 'KEYCODE_9',
  source: 'KEYCODE_TV_INPUT', settings: 'KEYCODE_SETTINGS', assist: 'KEYCODE_ASSIST', live: 'KEYCODE_TV',
  chup: 'KEYCODE_CHANNEL_UP', chdown: 'KEYCODE_CHANNEL_DOWN', info: 'KEYCODE_INFO', subtitle: 'KEYCODE_CAPTIONS',
  guide: 'KEYCODE_GUIDE', red: 'KEYCODE_PROG_RED', green: 'KEYCODE_PROG_GREEN', yellow: 'KEYCODE_PROG_YELLOW',
  blue: 'KEYCODE_PROG_BLUE', power: 'KEYCODE_POWER',
  del: 'KEYCODE_DEL', tab: 'KEYCODE_TAB', esc: 'KEYCODE_ESCAPE', pgup: 'KEYCODE_PAGE_UP', pgdn: 'KEYCODE_PAGE_DOWN',
};

// TV'deki açılabilir uygulamalar (adb ile okunur, 60 sn önbellek)
const APP_LABELS = {
  'com.netflix.ninja': 'Netflix', 'com.amazon.amazonvideo.livingroom': 'Prime Video', 'com.google.android.youtube.tv': 'YouTube',
  'com.disney.disneyplus': 'Disney+', 'com.spotify.tv.android': 'Spotify', 'com.google.android.youtube.tvmusic': 'YouTube Music',
  'com.apple.atve.androidtv.appletv': 'Apple TV', 'com.crunchyroll.crunchyroid': 'Crunchyroll', 'com.wbd.stream': 'HBO Max',
  'tv.wuaki.apptv': 'Rakuten TV', 'com.canal.android.canal': 'Canal+', 'pl.tvn.player.tv': 'TVN Player', 'com.tvp.vodtv.tv': 'TVP VOD',
  'bbc.iplayer.android': 'BBC iPlayer', 'uk.co.bbc.sounds': 'BBC Sounds', 'com.google.android.videos': 'Google TV',
  'com.android.vending': 'Play Store', 'com.android.tv.settings': 'Ayarlar', 'com.tcl.tv': 'Canlı TV', 'com.tcl.ui_mediaCenter': 'Medya Merkezi',
  'dev.dworks.apps.anexplorer': 'Dosyalar', 'com.phlox.tvwebbrowser': 'TV Bro (tarayıcı)', 'com.google.android.play.games': 'Play Games',
  'com.tcl.magiconnectfree': 'TCL Ekran Paylaşımı',
};
const APP_HIDDEN = new Set(['com.tcl.tv', 'com.tcl.partnercustomizer', 'com.tcl.guard', 'com.tcl.suspension', 'com.tcl.exhibit', 'com.tcl.dashboard',
  'com.tcl.ocean.instructions', 'com.tcl.waterfall.overseas', 'com.tcl.t_solo', 'com.tcl.smartalexa']);
let appsCache = { t: 0, list: [] };
async function tvApps(force) {
  if (!force && Date.now() - appsCache.t < 60000 && appsCache.list.length) return appsCache.list;
  const r = await sh('tv', 'cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER', 20000);
  if (!r.ok) throw new Error('TV’den uygulama listesi alınamadı');
  const seen = new Map(); let cur = null;
  for (const l of r.out.split('\n')) {
    const a = /^ {6}name=(\S+)\s*$/.exec(l); if (a) { cur = a[1]; continue; }
    const p = /^ {6}packageName=(\S+)\s*$/.exec(l);
    if (p && cur) { if (!seen.has(p[1])) seen.set(p[1], cur); cur = null; }
  }
  const list = [...seen].filter(([pkg]) => !APP_HIDDEN.has(pkg)).map(([pkg, act]) => ({
    pkg, act, name: APP_LABELS[pkg] || pkg.split('.').filter((s) => !['com', 'android', 'tv', 'app', 'apps', 'google', 'tcl'].includes(s)).pop() || pkg,
  })).sort((a, b) => (APP_LABELS[b.pkg] ? 1 : 0) - (APP_LABELS[a.pkg] ? 1 : 0) || a.name.localeCompare(b.name));
  appsCache = { t: Date.now(), list };
  return list;
}
const inRange = (n) => Number.isInteger(n) && n >= 0 && n <= 4000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wake-on-LAN sihirli paketi (yayın adresi + 7 ve 9 numaralı portlar)
function wakeOnLan(mac) {
  return new Promise((resolve) => {
    const m = Buffer.from(String(mac).replace(/[:-]/g, ''), 'hex');
    if (m.length !== 6) return resolve(false);
    const pkt = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(m)]);
    const s = dgram.createSocket('udp4');
    s.on('error', () => { try { s.close(); } catch {} resolve(false); });
    s.bind(() => {
      s.setBroadcast(true);
      s.send(pkt, 9, cfg.broadcast || '192.168.8.255', () => s.send(pkt, 7, cfg.broadcast || '192.168.8.255', () => { s.close(); resolve(true); }));
    });
  });
}

// Modemde engellenemeyecek cihazlar: sunucu, modem ve (varsa) ayarlardaki listeler
const PROTECTED_IPS = new Set(['192.168.8.1', '192.168.1.10', '192.168.1.11']); // modem, sunucu (kablo, Wi‑Fi)
const PROTECTED_MACS = () => new Set([...(cfg.protectedMacs || []), ...localMacs()].map((m) => m.toLowerCase()));
function localMacs() {
  return Object.values(os.networkInterfaces()).flat().map((i) => i && i.mac).filter((m) => m && m !== '00:00:00:00:00:00');
}
const MAC_RE = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/;
async function setBlock(mac, block) {
  mac = String(mac || '').toLowerCase();
  if (!MAC_RE.test(mac)) throw new Error('geçersiz MAC adresi');
  if (block && PROTECTED_MACS().has(mac)) throw new Error('bu cihaz korumalı (sunucu/modem), kesilemez');
  // GL.iNet 4.x: modemin kendi arayüzü gibi kara listeye ekler/çıkarır (black_white_list.set_single_mac)
  const conf = await gl.call('black_white_list', 'get_config', {});
  if (conf && conf.mode && conf.mode !== 'black') throw new Error('Modemde “beyaz liste” modu açık; kesme yalnızca kara liste modunda çalışır');
  await gl.call('black_white_list', 'set_single_mac', { mode: 'black', operate: block ? 'add' : 'del', mac: mac.toUpperCase() });
  return { ok: true, msg: block ? 'İnternet bağlantısı kesildi' : 'İnternet bağlantısı açıldı' };
}
const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
// Doğrudan yayın adresi: TV'de TV Bro, tablette Lightning tarayıcı açar ve çalar.
// Tablet (Android 6) yeni Let's Encrypt kökünü tanımıyor: HTTPS yayınları sunucu üzerinden düz HTTP ile aktarılır.
// Önce tarayıcının eski sekmeleri temizlenir ki her seferinde yeni sekme açılıp birikmesin.
function lanIp() {
  const r = require('child_process').spawnSync('ip', ['-o', 'route', 'get', '192.168.8.1'], { encoding: 'utf8' });
  const m = /src (\d+\.\d+\.\d+\.\d+)/.exec(r.stdout || '');
  return m ? m[1] : '192.168.1.10';
}
const proxied = (u) => `http://${lanIp()}:${cfg.port}/p/${cfg.mediaToken}?u=${encodeURIComponent(u)}`;
async function tabletOpen(url) {
  await sh('tablet', `am force-stop ${cfg.browserPkgTablet}`);
  await sh('tablet', `pm clear ${cfg.browserPkgTablet}`);
  return sh('tablet', `am start -a android.intent.action.VIEW -d ${q(url)} -n ${cfg.browserPkgTablet}/.MainActivity`);
}
const directPlay = (dev) => dev === 'tablet'
  ? tabletOpen(proxied(cfg.streamUrl))
  : sh('tv', `am start -a android.intent.action.VIEW -d ${q(cfg.streamUrl)} ${cfg.tvBroPkg}`);
const stopBrowser = (dev) => sh(dev, `am force-stop ${dev === 'tablet' ? cfg.browserPkgTablet : cfg.tvBroPkg}`);

const ACTIONS = {
  // 1) Doğrudan yayın adresi (TV veya tablet)
  async 'radio.direct'({ device }) {
    const dev = device === 'tablet' ? 'tablet' : 'tv';
    await sh(dev, 'input keyevent KEYCODE_WAKEUP');
    const r = await directPlay(dev);
    return { ok: r.ok, msg: r.ok ? `Doğrudan yayın ${dev === 'tv' ? 'TV' : 'tablet'}te başlatıldı` : r.err };
  },
  // 2) Chromecast ile yayın
  async 'radio.cast'() { await castRadio(); return { ok: true, msg: 'Radyo TV’ye yayınlanıyor' }; },
  // 3) Radyo sayfasını TV’ye yayınla
  // (DashCast bu TV’de adresi kabul etmedi; sayfa TV Bro ile doğrudan açılıyor.)
  async 'radio.castpage'() {
    try { await castStop(); } catch {}
    await sh('tv', 'input keyevent KEYCODE_WAKEUP');
    const r = await sh('tv', `am start -a android.intent.action.VIEW -d ${q(cfg.radioPage)} ${cfg.tvBroPkg}`);
    return { ok: r.ok, msg: r.ok ? 'Radyo sayfası TV’de açıldı (oynat tuşuna basın)' : r.err };
  },
  // 4) Tablette çal
  async 'radio.tablet'() {
    await sh('tablet', 'input keyevent KEYCODE_WAKEUP');
    const r = await directPlay('tablet');
    return { ok: r.ok, msg: r.ok ? 'Tablette çalıyor' : r.err };
  },
  async 'radio.stop'({ device }) {
    const out = [];
    if (!device || device === 'tv') {
      try { await castStop(); out.push('TV yayını durdu'); } catch (e) { out.push('TV: ' + e.message); }
      await stopBrowser('tv');
    }
    if (!device || device === 'tablet') {
      await stopBrowser('tablet');
      out.push('Tablet durdu');
    }
    return { ok: true, msg: out.join(' · ') };
  },
  // --- TV'yi kapalıyken açma: adb → Wake-on-LAN → Chromecast ---
  async 'tv.power_on'() {
    const tried = [];
    const awake = async () => {
      if ((await adbState('tv')) !== 'device') await run(ADB, ['connect', WIFI.tv], 6000);
      if ((await adbState('tv')) !== 'device') return false;
      return /Awake/.test((await sh('tv', 'dumpsys power | grep mWakefulness=')).out);
    };
    if (await awake()) return { ok: true, msg: 'TV zaten açık' };
    if ((await adbState('tv')) === 'device') { await sh('tv', 'input keyevent KEYCODE_WAKEUP'); tried.push('adb'); if (await awake()) return { ok: true, msg: 'TV açıldı (adb)' }; }
    await wakeOnLan(cfg.tv.mac || '14:ea:63:0f:f8:e6'); tried.push('Wake-on-LAN');
    for (let i = 0; i < 8; i++) { await sleep(1500); if (await awake()) return { ok: true, msg: 'TV açıldı (Wake-on-LAN)' }; }
    if (await tcpOpen(cfg.tv.ip, 8009)) {
      try { await castRadio(); await castStop(); tried.push('Chromecast'); } catch {}
      if (await awake()) return { ok: true, msg: 'TV açıldı (Chromecast)' };
    }
    return { ok: false, msg: `TV açılamadı (${tried.join(', ')} denendi). TV ayarlarında “Ağ beklemesi” açık olmalı.` };
  },
  // TV'yi açar ve ana ekrana alır; TCL'nin Miracast alıcısı TV açıkken bağlantıyı kendisi kabul eder
  async 'tv.mirror_ready'() {
    const r = await ACTIONS['tv.power_on']();
    if (!r.ok) return r;
    await sh('tv', 'input keyevent KEYCODE_HOME');
    return { ok: true, msg: 'TV hazır: telefonda Smart View’den TV’yi seçin' };
  },
  // --- sunucu ---
  async 'server.status'() {
    const df = await run('df', ['-h', '--output=used,size,pcent', '/']);
    let temp = null;
    try {
      const zones = fs.readdirSync('/sys/class/thermal').filter((z) => z.startsWith('thermal_zone'));
      const t = zones.map((z) => Number(fs.readFileSync(`/sys/class/thermal/${z}/temp`, 'utf8')) / 1000).filter((n) => n > 0);
      if (t.length) temp = Math.max(...t);
    } catch {}
    const up = os.uptime();
    const disk = df.out.split('\n').pop().trim().split(/\s+/);
    return { ok: true, msg: 'durum', server: {
      uptime: `${Math.floor(up / 86400)} gün ${Math.floor(up % 86400 / 3600)} saat`,
      boot: new Intl.DateTimeFormat('tr-TR', { timeZone: cfg.tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(Date.now() - up * 1000)),
      load: os.loadavg()[0].toFixed(2), mem: `%${Math.round((1 - os.freemem() / os.totalmem()) * 100)}`,
      disk: disk.length === 3 ? `${disk[0]} / ${disk[1]} (${disk[2]})` : '?', temp: temp ? `${temp.toFixed(0)}°C` : null,
    } };
  },
  async 'server.restart_service'({ name }) {
    if (name === 'personal-home-assistant') {
      setTimeout(() => run('systemctl', ['--user', 'restart', 'tv-kumanda']), 600);
      return { ok: true, msg: 'Personal Home Assistant yeniden başlıyor (birkaç saniye)' };
    }
    const allowed = { 'code-server': 'code-server@gelistirme' };
    if (!allowed[name]) throw new Error('bu servis listede yok');
    const r = await run('sudo', ['-n', '/usr/bin/systemctl', 'restart', allowed[name]], 30000);
    return { ok: r.ok, msg: r.ok ? `${name} yeniden başlatıldı` : 'Yetki yok: sunucuya bir kez sudo kuralı eklenmeli' };
  },
  async 'server.reboot'({ confirm }) {
    if (confirm !== 'EVET') throw new Error('onay gerekli');
    const r = await run('sudo', ['-n', '/usr/bin/systemctl', 'reboot'], 15000);
    return { ok: r.ok, msg: r.ok ? 'Sunucu yeniden başlıyor, 1-2 dakika sonra geri gelir' : 'Yetki yok: sunucuya bir kez sudo kuralı eklenmeli' };
  },
  // --- modem (GL.iNet) ---
  async 'net.clients'() {
    const r = await gl.call('clients', 'get_list');
    const list = (r && r.clients) || [];
    return { ok: true, clients: list.map((c) => ({
      mac: String(c.mac || '').toLowerCase(), ip: c.ip || '', name: c.alias || c.name || '', host: c.name || '', renamed: !!c.alias,
      online: !!c.online, blocked: !!c.blocked, iface: c.iface || c.type || '',
      rx: c.rx || c.total_rx || 0, tx: c.tx || c.total_tx || 0,
      protected: PROTECTED_MACS().has(String(c.mac || '').toLowerCase()) || (!!c.online && PROTECTED_IPS.has(c.ip)), // eski çevrim dışı kayıtlar aynı IP'yi taşıyabilir
    })) };
  },
  async 'net.set_password'({ password }) {
    const pw = String(password ?? '');
    if (!pw || pw.length > 128) throw new Error('şifre 1-128 karakter olmalı');
    if (locked('glinet-pw')) throw new Error('Çok fazla yanlış deneme, 5 dakika bekleyin');
    try { await gl.setPassword(pw); }
    catch (e) {
      if (/kabul edilmedi/.test(e.message)) { fail('glinet-pw'); throw new Error('Şifre yanlış. 192.168.8.1 adresine girerken kullandığınız şifreyi yazın.'); }
      throw e;
    }
    fails.delete('glinet-pw');
    return { ok: true, msg: 'Modem şifresi kaydedildi, bağlanıldı' };
  },
  // Cihaz adını modemde değiştir (GL.iNet "alias"); boş ad = varsayılana dön
  async 'net.rename'({ mac, name }) {
    const m = String(mac || '').toLowerCase();
    if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(m)) throw new Error('geçersiz cihaz');
    const alias = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
    await gl.call('clients', 'set_info', { mac: m.toUpperCase(), alias });
    const r = await gl.call('clients', 'get_list');
    const c = ((r && r.clients) || []).find((x) => String(x.mac || '').toLowerCase() === m);
    const ok = !!c && (c.alias || '') === alias;
    return { ok: true, verified: ok, msg: ok ? (alias ? `Ad değişti: ${alias}` : 'Varsayılan ada dönüldü') : 'Komut gitti ama modem adı güncellemedi' };
  },
  async 'net.block'({ mac }) { return setBlock(mac, true); },
  async 'net.unblock'({ mac }) { return setBlock(mac, false); },
  // --- sahneler: tek tuşla birden çok iş ---
  async 'scene.morning'() {
    const out = [];
    out.push((await ACTIONS['tv.power_on']()).msg);
    try { await castRadio(); out.push('radyo TV’de çalıyor'); } catch (e) { out.push('radyo başlamadı: ' + e.message); }
    return { ok: true, msg: out.join(' · ') };
  },
  async 'scene.quiet'() { return ACTIONS['radio.stop']({}); },
  async 'scene.night'() {
    await ACTIONS['radio.stop']({});
    await sh('tv', 'input keyevent KEYCODE_SLEEP');
    await sh('tablet', 'input keyevent KEYCODE_SLEEP');
    return { ok: true, msg: 'İyi geceler: radyo durdu, TV ve tablet ekranı kapandı' };
  },
  async 'scene.away'() {
    await ACTIONS['radio.stop']({});
    await sh('tv', 'input keyevent KEYCODE_SLEEP');
    return { ok: true, msg: 'Evden çıkış: radyo durdu, TV uyutuldu' };
  },
  async 'tv.key'({ key }) {
    if (!KEYS[key]) throw new Error('bilinmeyen tuş');
    const r = await sh('tv', `input keyevent ${KEYS[key]}`);
    return { ok: r.ok, msg: r.ok ? 'tamam' : r.err };
  },
  // Fare pedi: tek çağrıda birkaç tuş (sürükleme adımları)
  async 'tv.keys'({ keys }) {
    if (!Array.isArray(keys) || !keys.length || keys.length > 12) throw new Error('geçersiz tuş listesi');
    const codes = keys.map((k) => { if (!KEYS[k]) throw new Error('bilinmeyen tuş'); return KEYS[k]; });
    const r = await sh('tv', `input keyevent ${codes.join(' ')}`);
    return { ok: r.ok, msg: r.ok ? 'tamam' : r.err };
  },
  async 'tv.tap'({ x, y }) {
    const a = Math.round(Number(x)), b = Math.round(Number(y));
    if (!inRange(a) || !inRange(b)) throw new Error('geçersiz koordinat');
    const r = await sh('tv', `input tap ${a} ${b}`);
    return { ok: r.ok, msg: r.ok ? 'dokunuldu' : r.err };
  },
  async 'tv.swipe'({ x1, y1, x2, y2, ms }) {
    const v = [x1, y1, x2, y2].map((n) => Math.round(Number(n)));
    const d = Math.min(1500, Math.max(50, Math.round(Number(ms)) || 300));
    if (!v.every(inRange)) throw new Error('geçersiz koordinat');
    const r = await sh('tv', `input swipe ${v.join(' ')} ${d}`);
    return { ok: r.ok, msg: r.ok ? 'kaydırıldı' : r.err };
  },
  async 'tv.text'({ text }) {
    const t = String(text || '').slice(0, 200);
    if (!t) throw new Error('boş metin');
    if (!/^[A-Za-z0-9 .,:/@_+=?&#%-]+$/.test(t)) throw new Error('yalnızca harf, rakam ve . , : / @ _ + = ? & # % - ile boşluk destekleniyor (Türkçe harf yok)');
    const r = await sh('tv', `input text ${q(t.replace(/ /g, '%s'))}`);
    return { ok: r.ok, msg: r.ok ? 'yazıldı' : r.err };
  },
  async 'tv.volume'({ delta }) {
    const d = Number(delta);
    if (!Number.isFinite(d) || Math.abs(d) > 0.5) throw new Error('geçersiz ses');
    const level = await castVolume(d);
    return { ok: true, msg: `Ses ${Math.round(level * 100)}%` };
  },
  // Kaynak seçimi: HDMI girişlerine doğrudan geç (PlayStation 5 = HDMI 3, HW17)
  async 'tv.input'({ input }) {
    const map = { hdmi1: 'HW15', hdmi2: 'HW16', hdmi3: 'HW17', ps: (cfg.tvInputs || {}).ps || 'HW17', playstation: (cfg.tvInputs || {}).ps || 'HW17' };
    const id = map[input];
    if (!id) throw new Error('bilinmeyen kaynak');
    await sh('tv', 'input keyevent KEYCODE_WAKEUP');
    const r = await sh('tv', `am start -a android.intent.action.VIEW -d ${q('content://android.media.tv/passthrough/com.tcl.tvinput%2F.TvPassThroughService%2F' + id)}`);
    return { ok: r.ok, msg: r.ok ? 'Kaynak gönderildi' : r.err };
  },
  async 'tv.screenshot'() { return { ok: true, msg: 'ekran görüntüsü', image: 'tv' }; },
  async 'tv.apps'({ refresh }) { return { ok: true, apps: await tvApps(!!refresh) }; },
  async 'tv.app'({ pkg }) {
    let apps = await tvApps(false);
    let app = apps.find((a) => a.pkg === pkg);
    if (!app) { apps = await tvApps(true); app = apps.find((a) => a.pkg === pkg); }
    if (!app) throw new Error('uygulama bulunamadı');
    await sh('tv', 'input keyevent KEYCODE_WAKEUP');
    const r = await sh('tv', `am start -n ${q(app.pkg + '/' + app.act)}`);
    return { ok: r.ok, msg: r.ok ? `${app.name} açıldı` : r.err };
  },
  // --- tablet dokunmatik kontrol ---
  async 'tablet.tap'({ x, y }) {
    const a = Math.round(Number(x)), b = Math.round(Number(y));
    if (!inRange(a) || !inRange(b)) throw new Error('geçersiz koordinat');
    const r = await sh('tablet', `input tap ${a} ${b}`);
    return { ok: r.ok, msg: r.ok ? 'dokunuldu' : r.err };
  },
  async 'tablet.swipe'({ x1, y1, x2, y2, ms }) {
    const v = [x1, y1, x2, y2].map((n) => Math.round(Number(n)));
    const d = Math.min(1500, Math.max(50, Math.round(Number(ms)) || 300));
    if (!v.every(inRange)) throw new Error('geçersiz koordinat');
    const r = await sh('tablet', `input swipe ${v.join(' ')} ${d}`);
    return { ok: r.ok, msg: r.ok ? 'kaydırıldı' : r.err };
  },
  async 'tablet.text'({ text }) {
    const t = String(text || '').slice(0, 200);
    if (!t) throw new Error('boş metin');
    if (!/^[A-Za-z0-9 .,:/@_+=?&#%-]+$/.test(t)) throw new Error('yalnızca harf, rakam ve . , : / @ _ + = ? & # % - ile boşluk destekleniyor');
    const r = await sh('tablet', `input text ${q(t.replace(/ /g, '%s'))}`);
    return { ok: r.ok, msg: r.ok ? 'yazıldı' : r.err };
  },
  async 'tablet.wake'() {
    await sh('tablet', 'input keyevent KEYCODE_WAKEUP');
    await sh('tablet', 'input swipe 640 700 640 200 250'); // kilit ekranında PIN yok: yukarı kaydır
    return { ok: true, msg: 'Tablet uyandırıldı' };
  },
  async 'tablet.brightness'({ level }) {
    const n = Math.round(Number(level));
    if (!Number.isFinite(n)) throw new Error('geçersiz parlaklık');
    const v = Math.max(10, Math.min(255, n));
    const r = await sh('tablet', `settings put system screen_brightness ${v}`);
    return { ok: r.ok, msg: r.ok ? `Parlaklık %${Math.round(v / 2.55)}` : r.err };
  },
  async 'tablet.key'({ key }) {
    if (!KEYS[key]) throw new Error('bilinmeyen tuş');
    const r = await sh('tablet', `input keyevent ${KEYS[key]}`);
    return { ok: r.ok, msg: r.ok ? 'tamam' : r.err };
  },
};

// ---------- doğrulama katmanı ----------
// Her eylemden sonra cihazın gerçek durumu okunur ve yanıta verified: true | false | null eklenir.
//   true  = kanıtlandı (ör. uygulama gerçekten ön planda)
//   false = komut gönderildi ama beklenen durum görülmedi
//   null  = bu tür eylem doğrulanamaz (ör. yön tuşu): "gönderildi" denir, "tamam" denmez
const fgOf = async (dev) => {
  const r = await sh(dev, 'dumpsys activity activities | grep -m1 mResumedActivity');
  const m = / ([\w.]+)\/([\w.$]+)/.exec(r.out);
  return m ? m[1] : null;
};
const awakeOf = async (dev) => /Awake/.test((await sh(dev, 'dumpsys power | grep mWakefulness=')).out);
// Tüm ses akışlarının seviyeleri: medya çalmıyorken ses tuşu zil/bildirim sesini değiştirir, bu yüzden hepsine bakılır
const musicOf = async (dev) => {
  const r = await sh(dev, 'dumpsys audio | grep -E "^- STREAM_|^   Current:|^   Muted:"');
  return r.out.replace(/\s+/g, ' ').trim();
};
const castPlayingOf = async () => {
  const r = await sh('tv', 'dumpsys media_session');
  return /package=com\.google\.android\.apps\.mediashell[\s\S]{0,1500}?state=PlaybackState \{state=3/.test(r.out);
};
// Ses seviyesi metni: "Ses 29/100" ya da "Sessiz (29/100)"
async function volumeText(dev) {
  const r = await sh(dev, 'dumpsys audio | grep -A8 "^- STREAM_MUSIC"');
  const max = Number((/Max: (\d+)/.exec(r.out) || [])[1]) || 0;
  const v = (/streamVolume:(\d+)/.exec(r.out) || /\(speaker\): (\d+)/.exec(r.out) || [])[1];
  if (v == null || !max) return null;
  return /Muted: true/.test(r.out) ? `Sessiz (${v}/${max})` : `Ses ${v}/${max}`;
}
async function waitFor(check, ms = 5000, step = 600) {
  const end = Date.now() + ms;
  for (;;) { try { if (await check()) return true; } catch {} if (Date.now() >= end) return false; await sleep(step); }
}
const KEY_FG_CHANGES = new Set(['home', 'back', 'menu', 'source', 'settings', 'live', 'assist', 'info', 'recents', 'subtitle', 'guide']);
const KEY_VOLUME = new Set(['volup', 'voldown', 'mute']);

// eylem adı → hangi cihaza adb ile dokunuyor (çevrim dışıysa hemen “ulaşılamıyor” denir)
function adbDeviceOf(name, p) {
  if (name === 'tv.power_on' || name === 'tv.mirror_ready') return null; // kapalı TV'yi uyandırmaya çalışır
  if (name === 'radio.direct') return p.device === 'tablet' ? 'tablet' : 'tv';
  if (name === 'radio.stop' || name === 'tv.volume') return null; // Chromecast üzerinden çalışır
  if (/^tablet\./.test(name) || name === 'radio.tablet') return 'tablet';
  if (/^tv\./.test(name) || name === 'radio.castpage') return 'tv';
  return null;
}
// eylemden ÖNCE okunması gereken durum
const PRE = {
  'tv.key': async (p) => (KEY_VOLUME.has(p.key) ? { music: await musicOf('tv') } : KEY_FG_CHANGES.has(p.key) ? { fg: await fgOf('tv') } : p.key === 'power' ? { awake: await awakeOf('tv') } : null),
  'tablet.key': async (p) => (KEY_VOLUME.has(p.key) ? { music: await musicOf('tablet') } : KEY_FG_CHANGES.has(p.key) ? { fg: await fgOf('tablet') } : null),
};
// eylemden SONRA kanıt: { verified, msg? }
const VERIFY = {
  async 'tv.key'(p, pre) {
    if (p.key === 'sleep') return mk(await waitFor(async () => !(await awakeOf('tv')), 5000), 'TV uyudu', 'komut gönderildi ama TV hâlâ açık');
    if (p.key === 'wake') return mk(await waitFor(() => awakeOf('tv'), 5000), 'TV uyandı', 'komut gönderildi ama TV uyanmadı');
    if (p.key === 'power') return mk(await waitFor(async () => (await awakeOf('tv')) !== pre.awake, 5000), 'TV durumu değişti', 'komut gönderildi ama TV durumu değişmedi');
    if (KEY_VOLUME.has(p.key)) {
      const ok = await waitFor(async () => (await musicOf('tv')) !== pre.music, 3000, 400);
      const lvl = await volumeText('tv').catch(() => null);
      return mk(ok, lvl || 'ses değişti', `ses değişmedi${lvl ? ' — ' + lvl : ''} (en üstte/altta olabilir)`);
    }
    if (p.key === 'home') return mk(await waitFor(async () => /launcher/i.test((await fgOf('tv')) || ''), 4000), 'ana ekranda', 'komut gönderildi ama ana ekrana geçilmedi');
    if (KEY_FG_CHANGES.has(p.key)) { const ok = await waitFor(async () => (await fgOf('tv')) !== pre.fg, 3000); return ok ? { verified: true, msg: 'ekran değişti' } : { verified: null, msg: 'gönderildi (ekran aynı kaldı)' }; }
    return { verified: null, msg: 'gönderildi' };
  },
  async 'tv.app'(p) { return mk(await waitFor(async () => (await fgOf('tv')) === p.pkg, 6000), 'uygulama açıldı', 'komut gönderildi ama uygulama ekrana gelmedi'); },
  async 'tv.input'() { return mk(await waitFor(async () => (await fgOf('tv')) === 'com.tcl.tv', 6000), 'Kaynak değişti', 'komut gitti ama TV kaynağı değişmedi'); },
  async 'tv.volume'() { return { verified: true }; }, // TV'nin Chromecast cevabı seviyeyi onaylıyor
  async 'tv.power_on'() { return { verified: true }; },
  async 'tv.mirror_ready'() { return { verified: true }; },
  async 'radio.cast'() { return mk(await waitFor(castPlayingOf, 8000, 800), 'radyo çalıyor', 'yayın başlatıldı ama TV’de çalma görülmedi'); },
  async 'radio.castpage'() { return mk(await waitFor(async () => (await fgOf('tv')) === cfg.tvBroPkg, 6000), 'sayfa açıldı', 'komut gönderildi ama sayfa görülmedi'); },
  async 'radio.direct'(p) {
    const dev = p.device === 'tablet' ? 'tablet' : 'tv', pkg = dev === 'tablet' ? cfg.browserPkgTablet : cfg.tvBroPkg;
    return mk(await waitFor(async () => (await fgOf(dev)) === pkg, 6000), 'yayın tarayıcıda açıldı', 'komut gönderildi ama tarayıcı görülmedi');
  },
  async 'radio.tablet'() { return mk(await waitFor(async () => (await fgOf('tablet')) === cfg.browserPkgTablet, 6000), 'tablette açıldı', 'komut gönderildi ama tarayıcı görülmedi'); },
  async 'radio.stop'(p) {
    const bad = [];
    if (!p.device || p.device === 'tv') {
      if (await adbState('tv') === 'device') { if (await castPlayingOf()) bad.push('TV’de çalma sürüyor'); if ((await fgOf('tv')) === cfg.tvBroPkg) bad.push('TV tarayıcısı açık'); }
    }
    if ((!p.device || p.device === 'tablet') && await adbState('tablet') === 'device' && (await fgOf('tablet')) === cfg.browserPkgTablet) bad.push('tablet tarayıcısı açık');
    return bad.length ? { verified: false, msg: 'durdurma komutu gönderildi ama ' + bad.join(', ') } : { verified: true };
  },
  async 'tablet.key'(p, pre) {
    if (p.key === 'sleep') return mk(await waitFor(async () => !(await awakeOf('tablet')), 4000), 'ekran kapandı', 'komut gönderildi ama ekran hâlâ açık');
    if (KEY_VOLUME.has(p.key)) return mk(await waitFor(async () => (await musicOf('tablet')) !== pre.music, 3000, 400), 'ses değişti', 'komut gönderildi ama tablet sesi değişmedi (bu tablet ses tuşlarını uzaktan kabul etmiyor)');
    if (p.key === 'home') return mk(await waitFor(async () => /launcher|home/i.test((await fgOf('tablet')) || ''), 3000), 'ana ekranda', 'komut gönderildi ama ana ekrana geçilmedi');
    if (KEY_FG_CHANGES.has(p.key)) { const ok = await waitFor(async () => (await fgOf('tablet')) !== pre.fg, 3000); return ok ? { verified: true, msg: 'ekran değişti' } : { verified: null, msg: 'gönderildi (ekran aynı kaldı)' }; }
    return { verified: null, msg: 'gönderildi' };
  },
  async 'tablet.wake'() { return mk(await waitFor(() => awakeOf('tablet'), 4000), 'tablet uyandı', 'komut gönderildi ama tablet uyanmadı'); },
  async 'tablet.brightness'(p) {
    const want = Math.max(10, Math.min(255, Math.round(Number(p.level))));
    const got = Number((await sh('tablet', 'settings get system screen_brightness')).out);
    return mk(got === want, 'parlaklık ayarlandı', `komut gönderildi ama değer ${got} görünüyor`);
  },
  async 'net.block'(p) { return netVerify(p.mac, true); },
  async 'net.unblock'(p) { return netVerify(p.mac, false); },
  async 'scene.night'() {
    const bad = [];
    if (await adbState('tv') === 'device' && await awakeOf('tv')) bad.push('TV hâlâ açık');
    if (await adbState('tablet') === 'device' && await awakeOf('tablet')) bad.push('tablet hâlâ açık');
    return bad.length ? { verified: false, msg: 'sahne uygulandı ama ' + bad.join(', ') } : { verified: true };
  },
  async 'scene.away'() { return (await adbState('tv')) === 'device' && (await awakeOf('tv')) ? { verified: false, msg: 'sahne uygulandı ama TV hâlâ açık' } : { verified: true }; },
  async 'scene.morning'() { return mk(await waitFor(castPlayingOf, 8000, 800), 'TV açık, radyo çalıyor', 'TV açıldı ama radyo çalmaya başlamadı'); },
};
const mk = (ok, good, bad) => (ok ? { verified: true, msg: good } : { verified: false, msg: bad });
async function netVerify(mac, wantBlocked) {
  const m = String(mac || '').toLowerCase();
  const ok = await waitFor(async () => {
    const r = await gl.call('clients', 'get_list');
    const c = ((r && r.clients) || []).find((x) => String(x.mac).toLowerCase() === m);
    return c && !!c.blocked === wantBlocked;
  }, 8000, 1000);
  return mk(ok, wantBlocked ? 'internet kesik' : 'internet açık', 'komut gönderildi ama modem durumu değişmedi');
}

// Tüm eylemleri sar: önce cihaza ulaşılıyor mu, sonra eylem, sonra kanıt
for (const name of Object.keys(ACTIONS)) {
  const fn = ACTIONS[name];
  ACTIONS[name] = async (p = {}) => {
    const dev = adbDeviceOf(name, p);
    if (dev && (await adbState(dev)) !== 'device') {
      await run(ADB, ['connect', WIFI[dev]], 6000);
      if ((await adbState(dev)) !== 'device') {
        return { ok: false, verified: false, msg: `${dev === 'tv' ? 'TV' : 'Tablet'}’e ulaşılamıyor (adb bağlantısı yok)` };
      }
    }
    let pre = null;
    if (PRE[name]) { try { pre = await PRE[name](p); } catch {} }
    const r = await fn(p);
    if (!r || typeof r !== 'object') return r;
    if (r.ok && VERIFY[name] && r.verified === undefined) {
      try { const v = await VERIFY[name](p, pre || {}, r); r.verified = v.verified; if (v.msg) r.msg = v.msg; }
      catch { r.verified = null; }
    }
    if (r.ok && r.verified === undefined) r.verified = null;
    if (!r.ok) r.verified = false;
    return r;
  };
}

// ---------- asistan (kural + yerel model) ----------
// Sarmalayıcıdan SONRA eklenir: asistanın çağırdığı eylemler zaten doğrulamalı.
const { createAssistant } = require('./assistant');
const assistant = createAssistant({ ACTIONS, tvApps, statusFn: () => status() });
ACTIONS['assistant.ask'] = async ({ text }) => assistant.ask(text);
setTimeout(() => assistant.warm(), 15000);
// ---------- in-app player ----------
const { createPlayer } = require('./player');
const player = createPlayer();
const saveCfg = () => saveJson(CFG_FILE, cfg);
ACTIONS['player.poll'] = async ({ role }) => ({ ok: true, verified: null, msg: '', cmds: await player.poll(String(role)) });
// Radyo: hedef cihazın uygulaması çevrimiçiyse yayın uygulamanın içinde çalar (Cast/tarayıcı yerine)
for (const [name, role] of [['radio.cast', 'tv'], ['radio.tablet', 'tablet']]) {
  const orig = ACTIONS[name];
  ACTIONS[name] = async (p) => {
    if (player.online(role)) {
      player.send(role, { cmd: 'play', url: cfg.streamUrl, title: 'Radio', maxSec: 3600, vol: 0 });
      return { ok: true, verified: null, msg: `Radyo ${role === 'tv' ? 'TV' : 'tablet'} uygulamasında çalıyor` };
    }
    return orig(p);
  };
}
{
  const origStop = ACTIONS['radio.stop'];
  ACTIONS['radio.stop'] = async (p) => { player.stopAll(); return origStop(p); };
}

ACTIONS['assistant.confirm'] = async ({ id, yes }) => assistant.confirm(String(id || ''), !!yes);

async function status() {
  const [tvAdb, tabAdb, tvCast, ha] = await Promise.all([adbState('tv'), adbState('tablet'), tcpOpen(cfg.tv.ip, 8009), tcpOpen('127.0.0.1', cfg.haPort || 8123)]);
  let battery = null, tvAwake = null;
  if (tabAdb === 'device') {
    const b = await sh('tablet', 'dumpsys battery | grep -E "level|AC powered|USB powered"');
    const lv = /level: (\d+)/.exec(b.out); battery = lv ? { level: +lv[1], charging: /(AC|USB) powered: true/.test(b.out) } : null;
  }
  if (tvAdb === 'device') {
    const w = await sh('tv', 'dumpsys power | grep mWakefulness=');
    tvAwake = /Awake/.test(w.out);
  }
  const rt = await run('ip', ['-o', 'route', 'show', 'default']);
  const ifs = [...rt.out.matchAll(/dev (\S+)/g)].map((m) => m[1]);
  const link = { active: ifs[0] ? (ifs[0].startsWith('wl') ? 'wifi' : 'kablo') : null, wifi: ifs.some((i) => i.startsWith('wl')), kablo: ifs.some((i) => i.startsWith('en')) };
  const tabTransport = (await devId('tablet')) === USB_SERIAL ? 'usb' : 'wifi';
  const llm = await assistant.llmUp();
  return { radio: cfg.streamUrl, players: player.status(), tv: { adb: tvAdb, cast: tvCast, awake: tvAwake }, tablet: { adb: tabAdb, battery, transport: tabTransport }, link, llm, ha: { up: ha, port: cfg.haPort || 8123 }, time: nowTR(), apk: '/indir/' + cfg.apkToken };
}

// ---------- zamanlayıcı ----------
function nowTR() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: cfg.tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
  const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  return { day: dayMap[p.weekday], hm: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}
const MODES = { 'tv-cast': 'radio.cast', 'tv-direct': 'radio.direct', 'tv-page': 'radio.castpage', tablet: 'radio.tablet', 'net-block': 'net.block' };
let lastFired = {};
async function tick() {
  const { day, hm } = nowTR();
  for (const s of schedule) {
    if (!s.enabled || !MODES[s.mode] || !(s.days || []).includes(day)) continue;
    for (const [kind, time] of [['start', s.start], ['stop', s.stop]]) {
      if (!time || time !== hm) continue;
      const key = `${s.id}:${kind}:${day}:${hm}`;
      if (lastFired[key]) continue;
      lastFired = Object.fromEntries(Object.entries(lastFired).filter(([k]) => k.includes(`:${day}:`)));
      lastFired[key] = 1;
      try {
        if (s.mode === 'net-block') await setBlock(s.mac, kind === 'start'); // başla = interneti kes, bitiş = aç
        else if (kind === 'start') await ACTIONS[MODES[s.mode]]({ device: s.mode === 'tablet' ? 'tablet' : 'tv' });
        else await ACTIONS['radio.stop']({ device: s.mode === 'tablet' ? 'tablet' : 'tv' });
        log(`zamanlayıcı ${s.label || s.id} ${kind}`);
      } catch (e) { log(`zamanlayıcı hata ${s.label || s.id}: ${e.message}`); }
    }
  }
}
setInterval(tick, 20000);
function log(m) { console.log(new Date().toISOString(), m); }

// ---------- kimlik doğrulama ----------
const sign = (v) => crypto.createHmac('sha256', cfg.secret).update(v).digest('hex');
function makeToken() { const exp = Date.now() + 30 * 864e5; return `${exp}.${sign(String(exp))}`; }
function validToken(t) {
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function cookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
const fails = new Map();
function locked(ip) { const f = fails.get(ip); return f && f.n >= 5 && Date.now() < f.until; }
function fail(ip) { const f = fails.get(ip) || { n: 0 }; f.n++; f.until = Date.now() + 5 * 60e3; fails.set(ip, f); }


// ---------- medya vekili ----------
const PROXY_HOSTS = [{ test: (h) => { try { return h === new URL(cfg.streamUrl).hostname; } catch { return false; } } }];
function mediaProxy(target, req, res, hops = 0) {
  let u;
  try { u = new URL(String(target || '')); } catch { res.writeHead(400); return res.end('geçersiz adres'); }
  if (u.protocol !== 'https:' || !PROXY_HOSTS.some((re) => re.test(u.hostname))) { res.writeHead(403); return res.end('izinli değil'); }
  const up = require('https').get(u, { headers: { 'User-Agent': 'personal-home-assistant/1.0', ...(req.headers.range ? { Range: req.headers.range } : {}) }, timeout: 20000 }, (r) => {
    if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && hops < 3) { r.resume(); return mediaProxy(new URL(r.headers.location, u).toString(), req, res, hops + 1); }
    const h = { 'Content-Type': r.headers['content-type'] || 'audio/mpeg', 'Cache-Control': 'no-store' };
    for (const k of ['content-length', 'content-range', 'accept-ranges', 'icy-name', 'icy-br']) if (r.headers[k]) h[k] = r.headers[k];
    res.writeHead(r.statusCode, h);
    r.pipe(res);
    req.on('close', () => r.destroy());
  });
  up.on('timeout', () => up.destroy(new Error('zaman aşımı')));
  up.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end('kaynak açılamadı'); } else res.destroy(); });
}

// ---------- HTTP ----------
function body(req) {
  return new Promise((res, rej) => {
    let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e5) { rej(new Error('büyük')); req.destroy(); } });
    req.on('end', () => { try { res(d ? JSON.parse(d) : {}); } catch { rej(new Error('geçersiz JSON')); } });
  });
}
function send(res, code, obj, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
const PUB = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress;
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/login' && req.method === 'POST') {
      if (locked(ip)) return send(res, 429, { error: 'Çok fazla deneme, 5 dakika bekleyin' });
      const { pin } = await body(req);
      const a = Buffer.from(String(pin || '')), b = Buffer.from(cfg.pin);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        fails.delete(ip);
        return send(res, 200, { ok: true }, { 'Set-Cookie': `s=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}` });
      }
      fail(ip);
      return send(res, 401, { error: 'Yanlış PIN' });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!validToken(cookie(req, 's'))) return send(res, 401, { error: 'giriş gerekli' });
      if (url.pathname === '/api/status') return send(res, 200, await status());
      if (url.pathname === '/api/schedule' && req.method === 'GET') return send(res, 200, schedule);
      if (url.pathname === '/api/schedule' && req.method === 'POST') {
        const list = await body(req);
        if (!Array.isArray(list) || list.length > 50) throw new Error('geçersiz liste');
        schedule = list.map((s) => ({
          id: String(s.id || crypto.randomBytes(4).toString('hex')).slice(0, 20),
          label: String(s.label || '').slice(0, 40),
          mode: MODES[s.mode] ? s.mode : 'tv-cast',
          start: /^\d\d:\d\d$/.test(s.start) ? s.start : '',
          stop: /^\d\d:\d\d$/.test(s.stop) ? s.stop : '',
          days: (Array.isArray(s.days) ? s.days : []).map(Number).filter((d) => d >= 0 && d <= 6),
          enabled: !!s.enabled,
          mac: /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(String(s.mac || '').toLowerCase()) ? String(s.mac).toLowerCase() : undefined,
          sound: s.sound ? String(s.sound).slice(0, 500) : undefined,
          device: ['tv', 'tablet', 'both'].includes(s.device) ? s.device : undefined,
        }));
        saveJson(SCH_FILE, schedule);
        return send(res, 200, schedule);
      }
      if (url.pathname === '/api/screenshot') {
        const dev = url.searchParams.get('d') === 'tablet' ? 'tablet' : 'tv';
        return execFile(ADB, ['-s', await devId(dev), 'exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 20e6, timeout: 15000 }, (e, so) => {
          if (e || !so.length) return send(res, 502, { error: 'ekran alınamadı' });
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(so);
        });
      }
      if (url.pathname.startsWith('/api/do/') && req.method === 'POST') {
        const name = url.pathname.slice(8);
        const fn = Object.prototype.hasOwnProperty.call(ACTIONS, name) ? ACTIONS[name] : null;
        if (!fn) return send(res, 404, { error: 'bilinmeyen eylem' });
        try { return send(res, 200, await fn(await body(req))); }
        catch (e) { return send(res, 200, { ok: false, msg: e.message }); }
      }
      return send(res, 404, { error: 'yok' });
    }
    // Medya vekili: tablet/TV için yalnız izinli kaynaklardan HTTPS → HTTP aktarım. Yol rastgele anahtarlı (Chromecast çerez taşımaz).
    if (url.pathname === `/p/${cfg.mediaToken}` && req.method === 'GET') return mediaProxy(url.searchParams.get('u'), req, res);
    // APK indirme: giriş yapmış oturum (/kumanda.apk) ya da gizli bağlantı (/indir/<anahtar>)
    if (url.pathname === '/personal-home-assistant.apk' || url.pathname.startsWith('/indir/')) {
      if (locked(ip)) { res.writeHead(429); return res.end('çok fazla deneme'); }
      let ok = false;
      if (url.pathname === '/personal-home-assistant.apk') ok = validToken(cookie(req, 's'));
      else {
        const a = Buffer.from(url.pathname.slice(7)), b = Buffer.from(cfg.apkToken);
        ok = a.length === b.length && crypto.timingSafeEqual(a, b);
        if (!ok) fail(ip);
      }
      const apk = path.join(ROOT, 'android/out/Personal-Home-Assistant.apk');
      if (!ok || !fs.existsSync(apk)) { res.writeHead(404); return res.end('yok'); }
      res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': 'attachment; filename="Personal-Home-Assistant.apk"', 'Cache-Control': 'no-store' });
      return fs.createReadStream(apk).pipe(res);
    }
    // statik dosyalar
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    const f = path.normalize(path.join(PUB, p));
    if (!f.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); return res.end('yok'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(d);
    });
  } catch (e) { send(res, 400, { error: e.message }); }
});
server.listen(cfg.port, '0.0.0.0', () => log(`dinliyor :${cfg.port}`));
