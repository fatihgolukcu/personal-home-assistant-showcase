/* Personal Home Assistant — front end. Server API, act() verification language, api() timeout/reconnect and the Android.* bridge. */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const IOS=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---- İkonlar (24 px, 2 px çizgi; Figma ikon setiyle aynı) ----
const ICONS={
home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
tv:'<rect x="2" y="7" width="20" height="15" rx="2"/><path d="m17 2-5 5-5-5"/>',
tablet:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 18h.01"/>',
phone:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
devices:'<rect x="2" y="4" width="14" height="11" rx="2"/><path d="M6 19h6M9 15v4"/><rect x="15" y="9" width="7" height="12" rx="1.5"/>',
wifi:'<path d="M12 20h.01M2 8.82a15 15 0 0 1 20 0M5 12.859a10 10 0 0 1 14 0M8.5 16.429a5 5 0 0 1 7 0"/>',
globe:'<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
mic:'<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
radio:'<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.1 19.1 19"/><circle cx="12" cy="12" r="2"/>',
cast:'<path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6M2 12a9 9 0 0 1 8 8M2 16a5 5 0 0 1 4 4M2 20h.01"/>',
monitor:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
share:'<path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3M8 21h8M12 17v4M17 8l5-5M17 3h5v5"/>',
code:'<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
terminal:'<path d="m4 17 6-6-6-6M12 19h8"/>',
server:'<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
cpu:'<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
house:'<path d="M3 21h18M5 21V10l7-6 7 6v11M10 21v-6h4v6"/>',
bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
'bell-off':'<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7M10.3 21a1.94 1.94 0 0 0 3.4 0M2 2l20 20"/>',
'chevron-right':'<path d="m9 18 6-6-6-6"/>','chevron-left':'<path d="m15 18-6-6 6-6"/>','chevron-down':'<path d="m6 9 6 6 6-6"/>','chevron-up':'<path d="m18 15-6-6-6 6"/>',
plus:'<path d="M5 12h14M12 5v14"/>',minus:'<path d="M5 12h14"/>',
power:'<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04"/>',
volume:'<path d="M11 5 6 9H2v6h4l5 4zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>',
'volume-x':'<path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
'sun-dim':'<circle cx="12" cy="12" r="4"/><path d="M12 4h.01M20 12h.01M12 20h.01M4 12h.01M17.657 6.343h.01M17.657 17.657h.01M6.343 17.657h.01M6.343 6.343h.01"/>',
sunrise:'<path d="M12 2v8M5.2 11.2l1.4 1.4M2 18h2M20 18h2M17.4 12.6l1.4-1.4M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/>',
sunset:'<path d="M12 10V2M5.2 11.2l1.4 1.4M2 18h2M20 18h2M17.4 12.6l1.4-1.4M22 22H2M16 6l-4 4-4-4M16 18a4 4 0 0 0-8 0"/>',
moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
'moon-star':'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/><path d="M19 3v4M21 5h-4"/>',
exit:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
input:'<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
refresh:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/>',
back:'<path d="m12 19-7-7 7-7M19 12H5"/>',
menu:'<path d="M4 12h16M4 6h16M4 18h16"/>',
sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4"/>',
info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
play:'<path d="m7 4 12 8-12 8z"/>',
stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
check:'<path d="M20 6 9 17l-5-5"/>',
alert:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3ZM12 9v4M12 17h.01"/>',
x:'<path d="M18 6 6 18M6 6l12 12"/>',
send:'<path d="m22 2-7 20-4-9-9-4ZM22 2 11 13"/>',
keyboard:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
laptop:'<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
apps:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
'wifi-off':'<path d="M12 20h.01M8.5 16.429a5 5 0 0 1 7 0M5 12.859a10 10 0 0 1 5.17-2.69M19 12.859a10 10 0 0 0-2.007-1.523M2 8.82a15 15 0 0 1 4.177-2.643M22 8.82a15 15 0 0 0-11.288-3.764M2 2l20 20"/>',
edit:'<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
gamepad:'<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.42.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.55-.6-6.58-.69-7.26A4 4 0 0 0 17.32 5z"/>',
book:'<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
scroll:'<path d="M19 17V5a2 2 0 0 0-2-2H4M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
trash:'<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
};
const ic=(n,s=24)=>`<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||''}</svg>`;
const hydrate=(root=document)=>$$('i[data-ic]',root).forEach(e=>{e.innerHTML=ic(e.dataset.ic,+e.dataset.s||24)});

// ---- Bildirim ----
const TICON={ok:'check',warn:'alert',bad:'x'};
function toast(m,kind){
  const t=$('#toast');$('.ti',t).innerHTML=ic(TICON[kind]||'info',20);$('.m',t).textContent=m;
  t.dataset.kind=kind||'';t.classList.add('show');clearTimeout(toast.t);
  toast.t=setTimeout(()=>t.classList.remove('show'),kind==='bad'||kind==='warn'?4200:2600);
}
const setChip=(el,kind,text)=>{if(!el)return;el.hidden=false;el.className='chip '+kind;el.textContent=text};

// Her isteğin bir zaman aşımı var: kablo koparsa istek sonsuza kadar asılı kalmaz.
// Arka arkaya 2 ağ hatasında uygulama kendini yeniden bağlar (APK: kablo → Wi‑Fi → Tailscale adreslerini dener).
let netFails=0,reconnecting=false;
function tSignal(ms){
  try{if(window.AbortSignal&&AbortSignal.timeout)return AbortSignal.timeout(ms)}catch(e){}
  if(window.AbortController){const c=new AbortController();setTimeout(()=>{try{c.abort()}catch(e){}},ms);return c.signal}
  return undefined;
}
function netBanner(on){const b=$('#netBanner');if(b)b.hidden=!on}
function netLost(){
  netFails++;
  if(netFails<2||reconnecting)return;
  reconnecting=true;netBanner(true);
  if(window.Android&&typeof Android.retry==='function'){Android.retry();return}
  const t=setInterval(async()=>{try{const r=await fetch('/api/status',{cache:'no-store',signal:tSignal(4000)});if(r.status<500){clearInterval(t);location.reload()}}catch(e){}},3000);
}
async function api(path,body){
  const ms=path.startsWith('/api/do/')?60000:10000;
  let r;
  try{
    r=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:tSignal(ms)});
  }catch(e){netLost();throw new Error(e&&(e.name==='TimeoutError'||e.name==='AbortError')?'Sunucu yanıt vermedi':'Sunucuya ulaşılamadı')}
  netFails=0;if(reconnecting){reconnecting=false;netBanner(false)}
  if(r.status===401&&path!=='/api/login'){showLogin();throw new Error('giriş gerekli')}
  return r;
}
function showLogin(){$('#app').hidden=true;$('#login').hidden=false;document.body.classList.add('lg');document.body.classList.remove('nz');$('#pin').focus()}
function showApp(){$('#login').hidden=true;$('#app').hidden=false;document.body.classList.remove('lg');refresh();loadSchedule()}
$('#loginBtn').onclick=async()=>{
  const r=await api('/api/login',{pin:$('#pin').value.trim()});const j=await r.json().catch(()=>({}));
  if(r.ok){$('#pin').value='';showApp()}else toast(j.error||'Giriş başarısız','bad');
};
$('#pin').addEventListener('keydown',e=>{if(e.key==='Enter')$('#loginBtn').click()});

// Tek geri bildirim kuralı: tamam (doğrulandı) · bilgi (gönderildi, doğrulanamaz) · uyarı (gönderildi ama beklenen olmadı) · hata
async function act(name,body,btn){
  if(btn)btn.disabled=true;
  try{navigator.vibrate&&navigator.vibrate(12)}catch(e){}
  try{
    const r=await api('/api/do/'+name,body||{});const j=await r.json();
    const m=j.msg||(j.ok?'gönderildi':'hata');
    if(!j.ok)toast(m,'bad');
    else if(j.verified===true)toast(m,'ok');
    else if(j.verified===false)toast(m,'warn');
    else toast(m,'');
    if(/^(tv|radio|scene)\./.test(name)||name==='tv.key'){tvSoon&&tvSoon()}
    return j;
  }catch(e){toast(e.message,'bad')}finally{if(btn)btn.disabled=false}
}

// ---- Sayfa gezinmesi ----
const NAVMAP={home:'home',radio:'home',tv:'dev',tab:'dev',net:'net',sch:'sch'};
let lastDev='tv',loadedApps=false;
function showTab(tab){
  if(!$('#t-'+tab))return;
  if(tab==='tv'||tab==='tab')lastDev=tab;
  closeSheet();
  const nv=NAVMAP[tab];
  $$('nav button').forEach(x=>x.classList.toggle('on',x.dataset.tab===nv));
  $$('section').forEach(s=>s.classList.toggle('on',s.id==='t-'+tab));
  if(tab==='home')refresh();
  if(tab==='tab'){tabBusy=false;tabLoad()}
  if(tab==='tv'&&!loadedApps){loadedApps=true;loadApps(false)}
  if(tab==='net'){loadClients();loadServer()}
  window.scrollTo(0,0);
}
$$('nav [data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab==='dev'?lastDev:b.dataset.tab));

// Alt sayfalar (sheet)
let openSh=null;
function openSheet(id){closeSheet();openSh=$('#'+id);openSh.classList.add('on');$('#scrim').classList.add('on')}
function closeSheet(){if(openSh){openSh.classList.remove('on');openSh=null}$('#scrim').classList.remove('on')}
$('#scrim').onclick=closeSheet;

// Ortak tıklama: data-go / data-do / data-key / data-pkg / data-tkey / data-close (dinamik içerik için de çalışır)
document.addEventListener('click',e=>{
  const t=e.target;let el;
  if((el=t.closest('[data-close]')))return closeSheet();
  if((el=t.closest('[data-go]')))return showTab(el.dataset.go);
  if((el=t.closest('[data-do]')))return act(el.dataset.do,el.dataset.body?JSON.parse(el.dataset.body):{},el);
  if((el=t.closest('[data-key]')))return act('tv.key',{key:el.dataset.key},null);
  if((el=t.closest('[data-pkg]')))return act('tv.app',{pkg:el.dataset.pkg},null);
  if((el=t.closest('[data-tkey]')))return act('tablet.key',{key:el.dataset.tkey},null);
});
// Kaydırıcı dolgusu
const sl=e=>e&&e.style.setProperty('--p',((e.value-e.min)/(e.max-e.min)*100)+'%');
document.addEventListener('input',e=>{if(e.target.type==='range')sl(e.target)});

// ---- TV: uygulamalar ve ekran yansıtma ----
const hue=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))%360;return h};
async function loadApps(refresh){
  const el=$('#tvApps');
  try{
    const r=await api('/api/do/tv.apps',{refresh:!!refresh});const j=await r.json();
    if(!j.apps){el.innerHTML='<span class="hint">'+esc(j.msg||'liste alınamadı')+'</span>';return}
    el.innerHTML=j.apps.map(a=>`<button class="app" data-pkg="${esc(a.pkg)}"><span class="bd" style="background:hsl(${hue(a.pkg)} 55% 42%)">${esc(a.name.slice(0,1).toUpperCase())}</span><span class="n">${esc(a.name)}</span></button>`).join('')||'<span class="hint">Uygulama yok.</span>';
  }catch(e){el.innerHTML='<span class="hint">liste alınamadı</span>'}
}
$('#appsRefresh').onclick=()=>loadApps(true);
const tvImg=$('#tvShot');let tvBusy=false;
function tvLoad(){
  if(tvBusy||$('#app').hidden||!$('#t-tv').classList.contains('on'))return;
  tvBusy=true;
  tvImg.onload=()=>{tvBusy=false;tvImg.hidden=false;$('#tvPh').hidden=true};
  tvImg.onerror=()=>{tvBusy=false;toast('TV ekranı alınamadı','warn')};
  tvImg.src='/api/screenshot?d=tv&t='+Date.now();
}
setInterval(()=>{if($('#tvLive').checked)tvLoad()},1500);
const tvSoon=()=>{if($('#tvLive')&&$('#tvLive').checked)setTimeout(()=>{tvBusy=false;tvLoad()},1200)};
$('#tvLive').onchange=()=>{if($('#tvLive').checked){tvBusy=false;tvLoad()}};
$('#tvRefresh').onclick=()=>{tvBusy=false;tvLoad()};

// ---- Telefon → TV yansıtma / DeX ----
async function mirror(kind,btn){
  await act('tv.mirror_ready',{},btn);
  closeSheet();
  const app=window.Android&&typeof Android.isApp==='function';
  if(app&&kind==='dex'&&typeof Android.openDex==='function')Android.openDex();
  else if(app&&typeof Android.openCast==='function')Android.openCast();
  else setTimeout(()=>toast('Telefonda hızlı ayarlardan Smart View’e dokunup TV’yi seçin','warn'),2700);
}
$('#mirrorOpen').onclick=()=>openSheet('sheetMirror');
$('#mirrorBtn').onclick=e=>mirror('cast',e.currentTarget);
$('#dexBtn').onclick=e=>mirror('dex',e.currentTarget);

// ---- Asistan: kural + yerel model; ses telefonda tanınır, yanıt sesli okunur ----
let asstPending=null,micT=0;
function speak(t){
  try{
    if(window.Android&&typeof Android.speak==='function')Android.speak(t);
    else if(window.speechSynthesis){const u=new SpeechSynthesisUtterance(t);u.lang='tr-TR';speechSynthesis.cancel();speechSynthesis.speak(u)}
  }catch(e){}
}
const micOn=on=>{$('#micBtn').classList.toggle('on',!!on);clearTimeout(micT);if(on)micT=setTimeout(()=>micOn(false),9000)};
function asstShow(j,text){
  if(!j)return;
  const kind=!j.ok?'bad':j.confirm?'info':j.verified===true?'ok':j.verified===false?'warn':'mute';
  const lbl=!j.ok?'Hata':j.confirm?'Onay bekliyor':j.verified===true?'Doğrulandı':j.verified===false?'Doğrulanamadı':'Gönderildi';
  $('#asstOut').innerHTML=`<div class="q">“${esc(text)}”</div><div class="a">${esc(j.msg||'')}</div><div class="v"><span class="chip ${kind}">${lbl}</span><span class="hint">${j.via?esc(j.via)+(j.ms?' · '+(j.ms/1000).toFixed(1)+' sn':''):''}</span></div>`;
  asstPending=j.confirm?j.confirm.id:null;$('#asstConfirm').hidden=!asstPending;
  speak(j.msg||'');
}
async function asstConfirm(yes){
  const id=asstPending;asstPending=null;$('#asstConfirm').hidden=true;
  const j=await act('assistant.confirm',{id,yes},null);asstShow(j,yes?'evet':'hayır');
}
async function asstAsk(text){
  text=String(text||'').trim();if(!text)return;
  const n=text.toLocaleLowerCase('tr');
  if(asstPending&&/^(evet|tamam|olur|yap|onaylıyorum)/.test(n))return asstConfirm(true);
  if(asstPending&&/^(hayır|hayir|iptal|vazgeç|vazgec|yapma)/.test(n))return asstConfirm(false);
  $('#asstOut').innerHTML='<div class="q">“'+esc(text)+'”</div><div class="a">…</div>';
  const j=await act('assistant.ask',{text},$('#asstSend'));asstShow(j,text);
  $('#asstText').value='';
}
$('#asstSend').onclick=()=>asstAsk($('#asstText').value);
$('#asstText').addEventListener('keydown',e=>{if(e.key==='Enter')asstAsk($('#asstText').value)});
$('#asstYes').onclick=()=>asstConfirm(true);$('#asstNo').onclick=()=>asstConfirm(false);
window.onVoice=t=>{micOn(false);$('#asstText').value=t;asstAsk(t)};
window.onVoiceError=m=>{micOn(false);toast(m,'bad')};
$('#micBtn').onclick=()=>{
  micOn(true);
  if(window.Android&&typeof Android.listen==='function')return Android.listen();
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){micOn(false);return toast(IOS?'Bu modda mikrofon yok: yazın ya da klavyedeki mikrofon tuşuna dokunun':'Bu uygulama sürümünde mikrofon yok: yazarak deneyin ya da APK 1.4’ü kurun','warn')}
  const r=new SR();r.lang='tr-TR';r.onresult=e=>window.onVoice(e.results[0][0].transcript);r.onerror=()=>{micOn(false);toast('Ses anlaşılamadı','bad')};r.start();
};

// ---- Ağ (modem) ve sunucu ----
let clients=[];
const card=(cls,html)=>`<div class="card ${cls||''}">${html}</div>`;
function devIcon(c){
  const n=(c.name||'').toLowerCase();
  if(c.blocked)return 'wifi-off';
  if(/\btv\b|televizyon/.test(n))return 'tv';
  if(/tab/.test(n))return 'tablet';
  if(/phone|galaxy|iphone|pixel|telefon|\bs2\d/.test(n))return 'phone';
  if(/laptop|notebook|macbook|thinkpad|dizüstü|\bpc\b/.test(n))return 'laptop';
  if(/server|sunucu|x270|raspberry/.test(n))return 'server';
  return 'devices';
}
async function loadClients(){
  const el=$('#netList');
  try{
    const j=await (await api('/api/do/net.clients',{})).json();
    if(!j.clients){
      $('#netSum').hidden=true;
      if(/şifresi kayıtlı değil/.test(j.msg||'')){
        el.innerHTML=card('',`<b style="font-weight:500">Modemi yönetmek için bir kez modem yönetim şifresini girin.</b>
          <p class="hint">Bu, tarayıcıda <b>192.168.8.1</b> adresine (veya GL.iNet uygulamasına) girerken kullandığınız şifredir. Genelde Wi‑Fi şifresinden farklıdır.</p>
          <div class="field">${ic('lock',20)}<input id="glPw" type="password" autocomplete="current-password" placeholder="Modem şifresi"></div>
          <button class="btn pri wide" id="glSave">Kaydet ve bağlan</button>`);
        const save=async()=>{const p=$('#glPw').value;if(!p)return;const b=$('#glSave');b.disabled=true;
          try{const j2=await (await api('/api/do/net.set_password',{password:p})).json();toast(j2.msg||'hata',j2.ok?'ok':'bad');if(j2.ok)loadClients();}
          finally{b.disabled=false}};
        $('#glSave').onclick=save;$('#glPw').onkeydown=e=>{if(e.key==='Enter')save()};
      }else netErr(j.msg||'Modeme ulaşılamadı');
      return;
    }
    clients=j.clients;renderClients();
  }catch(e){netErr('Modeme ulaşılamadı')}
}
function netErr(msg){
  $('#netSum').hidden=true;
  $('#netList').innerHTML=card('err center',`<span class="bub lg bad">${ic('alert',26)}</span><h3>${esc(msg)}</h3><p class="ink2">Cihaz listesi alınamadı. Modem açık mı, sunucu ağa bağlı mı?</p><button class="btn" id="netRetry">${ic('refresh',20)}Yeniden dene</button>`);
  $('#netRetry').onclick=loadClients;
}
function renderClients(){
  const el=$('#netList'),all=$('#netOffline').checked;
  const on=clients.filter(c=>c.online&&!c.blocked).length,bl=clients.filter(c=>c.blocked).length,pr=clients.filter(c=>c.protected).length;
  const sum=$('#netSum');sum.hidden=false;
  sum.innerHTML=`<div><b class="num" style="color:var(--ok)">${on}</b><small>çevrim içi</small></div><div><b class="num" style="color:var(--bad)">${bl}</b><small>interneti kesik</small></div><div><b class="num" style="color:var(--ink2)">${pr}</b><small>korumalı</small></div>`;
  const list=clients.filter(c=>all||c.online||c.blocked).sort((a,b)=>(b.online-a.online)||(a.name||a.ip).localeCompare(b.name||b.ip));
  if(!list.length){el.innerHTML=card('center',`<span class="bub lg mute">${ic('devices',26)}</span><h3>Cihaz yok</h3><p class="ink2">Çevrim içi cihaz görünmüyor.</p>`);return}
  el.innerHTML='<div class="card flush list">'+list.map(c=>{
    const kind=c.blocked?'bad':c.online?'ok':'mute';
    const sub=esc(c.ip||'')+(c.online||c.blocked?'':' · çevrim dışı')+(c.blocked?' · interneti kesik':'');
    const edit=`<button class="ibtn flat" data-rename="${esc(c.mac)}" aria-label="Adı değiştir">${ic('edit',20)}</button>`;
    const trail=c.protected?edit+'<span class="chip mute">Korumalı</span>'
      :edit+`<button class="ibtn flat" data-zaman="${esc(c.mac)}" aria-label="Zamanla">${ic('clock',20)}</button><input type="checkbox" class="sw" data-net="${esc(c.mac)}" ${c.blocked?'':'checked'} aria-label="İnternet">`;
    return `<div class="li"><span class="bub ${kind}">${ic(devIcon(c),20)}</span><span class="t"><b>${esc(c.name||'(adsız cihaz)')}</b><small class="${c.blocked?'bad':''}">${sub}</small></span>${trail}</div>`}).join('')+'</div>';
}
$('#netList').addEventListener('change',async e=>{
  const s=e.target.closest('[data-net]');if(!s)return;
  await act(s.checked?'net.unblock':'net.block',{mac:s.dataset.net},s);loadClients();
});
// Cihaz adını değiştir (modemde saklanır)
let renMac='';
$('#netList').addEventListener('click',e=>{
  const r=e.target.closest('[data-rename]');if(!r)return;
  const c=clients.find(x=>x.mac===r.dataset.rename);if(!c)return;
  renMac=c.mac;$('#renName').value=c.renamed?c.name:'';$('#renName').placeholder=c.host||c.ip||'Cihaz adı';
  $('#renHost').textContent=c.host?'Cihazın kendi adı: '+c.host+' · '+(c.ip||''):(c.ip||'');
  $('#renReset').hidden=!c.renamed;openSheet('sheetName');setTimeout(()=>$('#renName').focus(),300);
});
async function renameDo(name){
  const j=await act('net.rename',{mac:renMac,name},$('#renSave'));
  if(j&&j.ok){closeSheet();loadClients()}
}
$('#renSave').onclick=()=>{const v=$('#renName').value.trim();if(!v)return toast('Bir ad yazın ya da varsayılana dönün','warn');renameDo(v)};
$('#renReset').onclick=()=>renameDo('');
$('#renName').addEventListener('keydown',e=>{if(e.key==='Enter')$('#renSave').click()});
$('#netList').addEventListener('click',e=>{
  const z=e.target.closest('[data-zaman]');if(!z)return;
  const c=clients.find(x=>x.mac===z.dataset.zaman)||{};
  openRule({label:(c.name||c.ip||'Cihaz')+' interneti',mode:'net-block',mac:c.mac,start:'22:00',stop:'07:00'});
});
$('#netRefresh').onclick=loadClients;$('#netOffline').onchange=renderClients;
async function loadServer(){
  try{
    const j=await (await api('/api/do/server.status',{})).json();const s=j.server;
    const st=(l,v)=>`<span class="stat">${l}<b>${esc(v)}</b></span>`;
    $('#srvStat').innerHTML=st('Açık',s.uptime)+st('Son açılış',s.boot||'?')+st('Yük',s.load)+st('Bellek',s.mem)+st('Disk',s.disk)+(s.temp?st('Sıcaklık',s.temp):'');
  }catch(e){$('#srvStat').innerHTML='<span class="hint">durum alınamadı</span>'}
}
// Geri dönüşü zor eylem: sayfanın içinde onay penceresi (telefon uygulaması confirm() göstermiyor)
$('#srvReboot').onclick=()=>openSheet('sheetReboot');
$('#rebootYes').onclick=async()=>{closeSheet();const b=$('#srvReboot');await act('server.reboot',{confirm:'EVET'},b)};

// ---- Ev: durum ----
const srow=(icon,title,sub,chip,kind,attrs,tag)=>`<${tag||'button'} class="li" ${attrs||''}><span class="bub ${kind==='bad'?'bad':''}">${ic(icon,20)}</span><span class="t"><b>${esc(title)}</b><small>${esc(sub)}</small></span><span class="chip ${kind}">${esc(chip)}</span></${tag||'button'}>`;
async function refresh(){
  try{
    const r=await api('/api/status');const s=await r.json();
    const b=s.tablet.battery;
    const tvOk=s.tv.adb==='device'||s.tv.cast, tabOk=s.tablet.adb==='device', haUp=!!(s.ha&&s.ha.up);
    const tvSub=s.tv.awake===null?(tvOk?'bağlı':'ulaşılamıyor'):s.tv.awake?'uyanık':'uykuda';
    const tabSub=tabOk?'bağlı · '+(s.tablet.transport==='usb'?'USB':'Wi‑Fi')+(b?` · pil %${b.level}${b.charging?' · şarjda':''}`:''):'ulaşılamıyor';
    const link=s.link?(s.link.active==='wifi'?'Wi‑Fi (kablo yok)':s.link.active==='kablo'?'Kablo'+(s.link.wifi?' + Wi‑Fi yedek':''):'bağlantı yok'):'';
    const linkKind=!s.link?'mute':s.link.active==='kablo'?'ok':s.link.active==='wifi'?'warn':'bad';
    $('#status').innerHTML=
      srow('tv','TV',tvSub,!tvOk?'Yok':s.tv.awake===false?'Uykuda':'Açık',!tvOk?'bad':s.tv.awake===false?'mute':'ok','data-go="tv"')+
      srow('tablet','Tablet',tabSub,tabOk?'Hazır':'Yok',tabOk?'ok':'bad','data-go="tab"')+
      (s.link?srow('server','Sunucu',link,s.link.active?'Çalışıyor':'Yok',s.link.active?'ok':'bad','data-go="net"'):'')+
      srow('cpu','Yerel model','Ev komutları ve sesli komut',s.llm?'Hazır':'Kapalı',s.llm?'ok':'mute','','div')+
      srow('house','Home Assistant',haUp?'akıllı ev paneli · çalışıyor':'şu an kapalı',haUp?'Çalışıyor':'Kapalı',haUp?'ok':'warn',`href="http://${esc(location.hostname)}:8123" target="_blank" rel="noopener"`,'a');
    $('#tvSub').textContent=tvSub;$('#tabSub').textContent=tabSub;
    setChip($('#tvChip'),tvOk?(s.tv.awake===false?'mute':'ok'):'bad',tvOk?(s.tv.awake===false?'TV uykuda':'TV açık'):'TV yok');
    setChip($('#tabChip'),tabOk?'ok':'bad',tabOk?'Tablet hazır':'Tablet yok');
    if(s.link){setChip($('#linkChip'),linkKind,s.link.active==='kablo'?'Bağlı · kablo':s.link.active==='wifi'?'Wi‑Fi (kablo yok)':'Bağlantı yok');setChip($('#srvChip'),s.link.active?'ok':'bad',s.link.active?'Çalışıyor':'Yok');$('#srvLink').textContent=link}
    $('#clock').textContent=s.time.hm;
    if(s.apk)window.APK_PATH=s.apk;
    if(s.radio)window.RADIO_URL=s.radio;window.PLAYERS=s.players||{};
    const h=+s.time.hm.slice(0,2);
    $('#hello').textContent=(h<6?'İyi geceler':h<12?'Günaydın':h<18?'İyi günler':'İyi akşamlar');
  }catch(e){}
}
setInterval(()=>{if(!$('#app').hidden)refresh()},20000);

// ---- Rutinler ----
const DAYS=[['1','Pzt'],['2','Sal'],['3','Çar'],['4','Per'],['5','Cum'],['6','Cmt'],['0','Paz']];
const MODES={'tv-cast':['Radyo · TV (Chromecast)','radio'],'tv-direct':['Radyo · TV (doğrudan)','radio'],'tv-page':['Radyo · TV (sayfa)','radio'],'tablet':['Radyo · Tablet','radio'],'net-block':['İnterneti kes','wifi-off']};
const ruleType=m=>m==='net-block'?'net':'radio';
let sched=[],ruleDraft=null,ruleIdx=-1;
function ruleSub(s){
  let t=(MODES[s.mode]||[s.mode])[0];
  if(s.mode==='net-block'){const c=clients.find(x=>x.mac===s.mac);t+=' · '+(c?(c.name||c.ip):(s.mac||'?'))}
  return t;
}
function renderSched(){
  const el=$('#schList');
  $('#schAdd2').hidden=!sched.length;
  if(!sched.length){el.innerHTML=card('center',`<span class="bub lg mute">${ic('clock',26)}</span><h3>Henüz rutin yok</h3><p class="ink2">Belirli saatte radyo veya internet kesme ekleyin.</p><button class="btn pri" data-newrule>${ic('plus',20)}Rutin ekle</button>`);return}
  el.innerHTML=sched.map((s,i)=>`<div class="card rule${s.enabled?'':' off'}">
    <div class="row"><span class="bub">${ic((MODES[s.mode]||[0,'clock'])[1],20)}</span><div class="grow"><b style="font-weight:500">${esc(s.label||'Rutin')}</b><div class="hint">${esc(ruleSub(s))}</div></div><input type="checkbox" class="sw" data-rsw="${i}" ${s.enabled?'checked':''} aria-label="Açık / kapalı"></div>
    <div class="time">${esc(s.start||'--:--')}${s.stop?' → '+esc(s.stop):''}</div>
    <div class="days">${DAYS.map(d=>`<span class="dchip${(s.days||[]).includes(+d[0])?' on':''}">${d[1]}</span>`).join('')}</div>
    <div class="rfoot"><button class="ibtn flat" data-redit="${i}" aria-label="Düzenle">${ic('edit',20)}</button><button class="ibtn flat bad" data-rdel="${i}" aria-label="Sil">${ic('trash',20)}</button></div>
  </div>`).join('');
}
async function loadSchedule(){try{sched=await (await api('/api/schedule')).json();renderSched()}catch(e){}}
async function saveSched(msg){
  try{
    const r=await api('/api/schedule',sched);
    if(r.ok){sched=await r.json();renderSched();toast(msg||'Kaydedildi','ok');return true}
  }catch(e){}
  toast('Kaydedilemedi','bad');loadSchedule();return false;
}
let delArm={i:-1,t:0};
$('#schList').addEventListener('change',e=>{const s=e.target.closest('[data-rsw]');if(!s)return;const i=+s.dataset.rsw;sched[i].enabled=s.checked;saveSched(s.checked?'Rutin açıldı':'Rutin kapatıldı')});
$('#schList').addEventListener('click',e=>{
  let b;
  if((b=e.target.closest('[data-redit]')))return openRule(+b.dataset.redit);
  if(e.target.closest('[data-newrule]'))return openRule();
  if((b=e.target.closest('[data-rdel]'))){
    const i=+b.dataset.rdel;
    if(delArm.i!==i||Date.now()-delArm.t>4000){delArm={i,t:Date.now()};return toast('Silmek için tekrar dokunun','warn')}
    delArm={i:-1,t:0};sched.splice(i,1);saveSched('Rutin silindi');
  }
});
$('#schAdd').onclick=()=>openRule();$('#schAdd2').onclick=()=>openRule();

function openRule(x){
  if(typeof x==='number'){ruleIdx=x;ruleDraft=JSON.parse(JSON.stringify(sched[x]));$('#ruleTitle').textContent='Rutini düzenle'}
  else{ruleIdx=-1;ruleDraft=Object.assign({label:'',enabled:true,mode:'tv-cast',start:'07:00',stop:'',days:[0,1,2,3,4,5,6]},x||{});$('#ruleTitle').textContent='Yeni rutin'}
  renderRule();openSheet('sheetRule');
}
function renderRule(){
  const d=ruleDraft,ty=ruleType(d.mode);
  const sel=(f,opts,cur)=>`<div class="field"><select data-f="${f}">${opts.map(o=>`<option value="${esc(o[0])}" ${o[0]===cur?'selected':''}>${esc(o[1])}</option>`).join('')}</select>${ic('chevron-down',20).replace('class="i"','class="i pt"')}</div>`;
  const macs=clients.filter(c=>!c.protected).map(c=>[c.mac,(c.name||c.ip||c.mac)]);
  $('#ruleBody').innerHTML=`
    <div class="fgrp"><label class="lbl">Ad</label><div class="field"><input data-f="label" value="${esc(d.label)}" placeholder="Örn: Hafta içi uyanma" autocomplete="off"></div></div>
    <div><span class="lbl">Tür</span><div class="types">${[['radio','radio','Radyo'],['net','wifi-off','İnternet kes']].map(([k,i,l])=>`<button class="type${ty===k?' on':''}" data-rt="${k}">${ic(i,22)}${l}</button>`).join('')}</div></div>
    ${ty==='radio'?`<div class="fgrp"><span class="lbl">Nerede çalsın</span>${sel('mode',['tv-cast','tv-direct','tv-page','tablet'].map(m=>[m,MODES[m][0]]),d.mode)}</div>`:''}
    ${ty==='net'?`${macs.length?`<div class="fgrp"><span class="lbl">Cihaz</span>${sel('macpick',[['','Listeden seçin…'],...macs],macs.some(m=>m[0]===d.mac)?d.mac:'')}</div>`:''}
      <div class="fgrp"><label class="lbl">Cihaz MAC adresi</label><div class="field"><input data-f="mac" value="${esc(d.mac||'')}" placeholder="aa:bb:cc:dd:ee:ff" autocomplete="off"></div><p class="hint" style="margin-top:4px">Başlangıçta internet kesilir, bitişte açılır.</p></div>`:''}
    <div class="grid2"><div class="fgrp"><label class="lbl">Başlangıç</label><div class="field"><input data-f="start" type="time" value="${esc(d.start||'')}"></div></div>
      <div class="fgrp"><label class="lbl">Bitiş (isteğe bağlı)</label><div class="field"><input data-f="stop" type="time" value="${esc(d.stop||'')}"></div></div></div>
    <div><span class="lbl">Günler</span><div class="days">${DAYS.map(x=>`<button class="dchip${(d.days||[]).includes(+x[0])?' on':''}" data-rd="${x[0]}" type="button">${x[1]}</button>`).join('')}</div></div>`;
}
function ruleRead(){
  const b=$('#ruleBody'),v=f=>{const e=b.querySelector('[data-f="'+f+'"]');return e?e.value:undefined},d=ruleDraft;
  const l=v('label');if(l!==undefined)d.label=l;
  const s=v('start');if(s!==undefined)d.start=s;const p=v('stop');if(p!==undefined)d.stop=p;
  const m=v('mode');if(m)d.mode=m;const so=v('sound');if(so)d.sound=so;
  const mac=v('mac');if(mac!==undefined)d.mac=mac.trim().toLowerCase();
  if(b.querySelector('[data-rd]'))d.days=$$('[data-rd]',b).filter(x=>x.classList.contains('on')).map(x=>+x.dataset.rd);
}
$('#ruleBody').addEventListener('click',e=>{
  let el;
  if((el=e.target.closest('[data-rd]')))return el.classList.toggle('on');
  if((el=e.target.closest('[data-rt]'))){
    ruleRead();const k=el.dataset.rt,d=ruleDraft;
    if(k==='radio'&&ruleType(d.mode)!=='radio')d.mode='tv-cast';
    if(k==='net')d.mode='net-block';
    return renderRule();
  }
  if((el=e.target.closest('[data-rdev]'))){ruleRead();ruleDraft.device=el.dataset.rdev;renderRule()}
});
$('#ruleBody').addEventListener('change',e=>{
  if(e.target.matches('[data-f="macpick"]')&&e.target.value){const i=$('[data-f="mac"]',$('#ruleBody'));if(i)i.value=e.target.value}
});
$('#ruleSave').onclick=async()=>{
  ruleRead();const d=ruleDraft,ty=ruleType(d.mode);
  if(!/^\d\d:\d\d$/.test(d.start||''))return toast('Başlangıç saatini seçin','warn');
  if(d.stop&&!/^\d\d:\d\d$/.test(d.stop))return toast('Bitiş saati geçersiz','warn');
  if(ty==='net'&&!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(d.mac||''))return toast('Geçerli bir cihaz MAC adresi girin','warn');
  if(!d.days||!d.days.length)d.days=[0,1,2,3,4,5,6];
  const r={id:d.id,label:(d.label||'').trim()||(ty==='net'?'İnternet kes':'Radyo'),enabled:d.enabled!==false,mode:d.mode,start:d.start,stop:d.stop||'',days:d.days};
  if(ty==='net')r.mac=d.mac;
  if(ruleIdx>=0)sched[ruleIdx]=r;else sched.push(r);
  const ok=await saveSched(ruleIdx>=0?'Rutin güncellendi':'Rutin eklendi');
  if(ok)closeSheet();
};

// ---- tablet ----
const tabImg=$('#tabShot');
let tabBusy=false,down=null;
function tabLoad(){
  if(tabBusy||$('#app').hidden||!$('#t-tab').classList.contains('on'))return;
  tabBusy=true;
  tabImg.onload=()=>{tabBusy=false};
  tabImg.onerror=()=>{tabBusy=false};
  tabImg.src='/api/screenshot?d=tablet&t='+Date.now();
}
const tabSoon=()=>setTimeout(()=>{tabBusy=false;tabLoad()},500);
setInterval(()=>{if($('#tabLive').checked)tabLoad()},1300);
$('#tabRefresh').onclick=()=>{tabBusy=false;tabLoad()};
tabImg.addEventListener('pointerdown',e=>{e.preventDefault();tabImg.setPointerCapture(e.pointerId);down={x:e.clientX,y:e.clientY,t:Date.now()}});
tabImg.addEventListener('pointercancel',()=>{down=null});
tabImg.addEventListener('pointerup',async e=>{
  if(!down||!tabImg.naturalWidth){down=null;return}
  const r=tabImg.getBoundingClientRect(),sx=tabImg.naturalWidth/r.width,sy=tabImg.naturalHeight/r.height;
  const pt=(cx,cy)=>[Math.round((cx-r.left)*sx),Math.round((cy-r.top)*sy)];
  const [x1,y1]=pt(down.x,down.y),[x2,y2]=pt(e.clientX,e.clientY);
  const dist=Math.hypot(e.clientX-down.x,e.clientY-down.y),ms=Math.min(Math.max(Date.now()-down.t,120),800);
  down=null;
  await (dist<12?act('tablet.tap',{x:x2,y:y2},null):act('tablet.swipe',{x1,y1,x2,y2,ms},null));
  tabSoon();
});
$('#tabSend').onclick=async()=>{const t=$('#tabText').value;if(!t)return;await act('tablet.text',{text:t},$('#tabSend'));tabSoon()};
$('#tabText').addEventListener('keydown',e=>{if(e.key==='Enter')$('#tabSend').click()});
let bt;$('#tabBright').oninput=e=>{clearTimeout(bt);bt=setTimeout(()=>act('tablet.brightness',{level:+e.target.value},null),250)};


// ---- Uygulama içi oynatıcı (bu cihaz) ----
const absUrl=u=>/^https?:/.test(u)?u:location.origin+u;
const PL={cur:null,audio:null,t0:0};
function playHere(item){
  stopHere(true);
  if(window.Android&&typeof Android.play==='function')Android.play(absUrl(item.url),item.title,item.max||0);
  else{const a=new Audio(absUrl(item.url));a.onended=()=>{PL.cur=null;drawMini()};a.play().catch(()=>toast('Ses başlatılamadı: tekrar dokunun','warn'));PL.audio=a}
  PL.cur=item;PL.t0=Date.now();drawMini();
}
function stopHere(silent){
  try{if(window.Android&&typeof Android.stopPlay==='function')Android.stopPlay()}catch(e){}
  if(PL.audio){PL.audio.pause();PL.audio=null}
  PL.cur=null;if(!silent)drawMini();
}
function drawMini(){const m=$('#mini');if(!m)return;m.hidden=!PL.cur;if(PL.cur)$('#miniT').textContent=PL.cur.title}
$('#miniStop').onclick=()=>{stopHere();toast('Durduruldu','ok')};
setInterval(()=>{ // uygulama oynatıcısı bitti mi?
  if(!PL.cur)return;
  if(window.Android&&typeof Android.isPlaying==='function'&&Date.now()-PL.t0>6000&&!Android.isPlaying()){PL.cur=null;drawMini()}
},2500);

// APK indirme: oturumsuz çalışan adrese git; uygulama içindeyse tarayıcıya devret
$('#apkLink').addEventListener('click',e=>{
  if(!window.APK_PATH)return; // oturum yoksa varsayılan davranış
  const url=location.origin+window.APK_PATH;
  if(window.Android&&typeof Android.openExternal==='function'){e.preventDefault();Android.openExternal(url);return}
  if(window.Android){ // eski uygulama sürümü: bağlantıları açamaz
    e.preventDefault();$('#apkUrl').value=url;openSheet('sheetApk');setTimeout(()=>{$('#apkUrl').focus();$('#apkUrl').select()},300);return}
  $('#apkLink').href=window.APK_PATH; // tarayıcı: normal indirme
});
$('#apkCopy').onclick=async()=>{const i=$('#apkUrl');i.focus();i.select();try{await navigator.clipboard.writeText(i.value);toast('Adres kopyalandı','ok')}catch(e){try{document.execCommand('copy');toast('Adres kopyalandı','ok')}catch(x){toast('Adresi seçili halde uzun basıp kopyalayın','warn')}}};

// ---- TV fare pedi + klavye (telefon/tablet): sürükleme ok tuşlarına, dokunma OK'a çevrilir ----
(function(){
  const pad=$('#tvPad');if(!pad)return;
  let q=[],busy=false;
  async function flush(){busy=true;while(q.length){const b=q.splice(0,10);try{await api('/api/do/tv.keys',{keys:b})}catch(e){q.length=0;toast('TV’ye ulaşılamadı','bad')}}busy=false}
  const send=keys=>{q.push(...keys);if(q.length>24)q.splice(0,q.length-24);if(!busy)flush()};
  const buzz=ms=>{try{navigator.vibrate&&navigator.vibrate(ms)}catch(e){}};
  const pts=new Map();let g=null;const STEP=34;
  pad.addEventListener('pointerdown',e=>{
    e.preventDefault();try{pad.setPointerCapture(e.pointerId)}catch(x){}
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});pad.classList.add('act');
    if(pts.size===1){g={t0:Date.now(),moved:0,ax:0,ay:0,multi:false,fired:false,first:e.pointerId};
      g.long=setTimeout(()=>{if(g&&!g.moved&&!g.multi){g.fired=true;buzz(25);send(['back'])}},650)}
    else if(g)g.multi=true;
  });
  pad.addEventListener('pointermove',e=>{
    if(!g||e.pointerId!==g.first||!pts.has(e.pointerId))return;
    const p=pts.get(e.pointerId),dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    g.moved+=Math.abs(dx)+Math.abs(dy);g.ax+=dx;g.ay+=dy;
    if(g.multi)return;
    const keys=[];
    while(Math.abs(g.ax)>=STEP&&keys.length<6){keys.push(g.ax>0?'right':'left');g.ax-=Math.sign(g.ax)*STEP}
    while(Math.abs(g.ay)>=STEP&&keys.length<6){keys.push(g.ay>0?'down':'up');g.ay-=Math.sign(g.ay)*STEP}
    if(keys.length){buzz(6);send(keys)}
  });
  const end=e=>{
    pts.delete(e.pointerId);if(pts.size||!g)return;
    clearTimeout(g.long);const dt=Date.now()-g.t0;
    if(!g.fired){
      if(g.multi&&g.moved<30&&dt<400){buzz(15);send(['home'])}
      else if(!g.multi&&g.moved<12&&dt<350){buzz(15);send(['ok'])}
    }
    g=null;pad.classList.remove('act');
  };
  pad.addEventListener('pointerup',end);pad.addEventListener('pointercancel',end);
  // klavye
  const kb=$('#tvKbd');
  const sendText=async t=>{if(!t)return;try{const r=await api('/api/do/tv.text',{text:t});const j=await r.json();if(!j.ok)toast(j.msg||'Yazılamadı','warn')}catch(e){toast('TV’ye ulaşılamadı','bad')}};
  kb.addEventListener('input',e=>{
    if(!$('#tvKbdLive').checked)return;
    if(e.inputType==='deleteContentBackward'){send(['del']);return}
    if(e.data)sendText(e.data);else if(e.inputType==='insertLineBreak')send(['enter']);
  });
  kb.addEventListener('keydown',e=>{
    const m={Enter:'enter',Escape:'back',ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Tab:'tab',PageUp:'pgup',PageDown:'pgdn'};
    if(e.key==='Backspace'&&!kb.value){e.preventDefault();send(['del']);return}
    if(m[e.key]&&(e.key!=='Enter'||$('#tvKbdLive').checked||!kb.value)){e.preventDefault();send([m[e.key]])}
  });
  $('#tvKbdSend').onclick=async()=>{const t=kb.value;if(!t)return;await sendText(t);kb.value=''};
  // TV ekran görüntüsüne dokunma = TV ekranında tıklama (adb)
  const img=$('#tvShot');let d0=null;
  img.style.touchAction='none';
  img.addEventListener('pointerdown',e=>{e.preventDefault();img.setPointerCapture(e.pointerId);d0={x:e.clientX,y:e.clientY,t:Date.now()}});
  img.addEventListener('pointercancel',()=>{d0=null});
  img.addEventListener('pointerup',async e=>{
    if(!d0||!img.naturalWidth){d0=null;return}
    const r=img.getBoundingClientRect(),sx=img.naturalWidth/r.width,sy=img.naturalHeight/r.height;
    const pt=(cx,cy)=>[Math.round((cx-r.left)*sx),Math.round((cy-r.top)*sy)];
    const [x1,y1]=pt(d0.x,d0.y),[x2,y2]=pt(e.clientX,e.clientY);
    const dist=Math.hypot(e.clientX-d0.x,e.clientY-d0.y),ms=Math.min(Math.max(Date.now()-d0.t,120),800);d0=null;
    await (dist<12?act('tv.tap',{x:x2,y:y2},null):act('tv.swipe',{x1,y1,x2,y2,ms},null));
    tvBusy=false;setTimeout(tvLoad,600);
  });
})();

// ---- başlangıç ----
// iPhone/iPad: APK, Smart View ve DeX Android'e özgü; gizle. Ana ekrana eklenince tam ekran uygulama gibi açılır.
if(window.Android&&typeof Android.isTv==='function'&&Android.isTv()){document.body.classList.add('tv');const mo=$('#asstOut');if(mo)mo.textContent='Sesle komut için telefondaki uygulamayı ya da kumandanın Asistan tuşunu kullanın; buraya yazarak da komut verebilirsiniz.';$('#mirrorOpen').hidden=true;const ap=$('#apkLink');if(ap)ap.parentElement.hidden=true}
if(IOS){$('#mirrorOpen').hidden=true;const a=$('a[href="/personal-home-assistant.apk"]');if(a)a.parentElement.hidden=true}
hydrate();
$('#dateLbl').textContent=(()=>{try{return new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',weekday:'long'}).format(new Date())}catch(e){return ''}})();
$$('input[type=range]').forEach(sl);
(async()=>{const r=await fetch('/api/status');r.status===401?showLogin():showApp()})();
