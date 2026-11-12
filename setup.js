// SaveBrain — one-time setup: creates/configures the user's own Supabase project via the Management API.
// The access token only lives in memory for this tab and is never stored.
const CONFIG_KEY='savebrain_config';
const MGMT='https://api.supabase.com/v1';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function getConfig(){
  try{ const c=JSON.parse(localStorage.getItem(CONFIG_KEY)); if(c?.url && c?.key) return c; }catch(e){}
  return null;
}
function saveConfig(c){ try{ localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); return true; }catch(e){ return false; } }
function clearConfig(){ try{ localStorage.removeItem(CONFIG_KEY); }catch(e){} }
const sleep = ms => new Promise(r=>setTimeout(r, ms));
async function retry(fn, tries, delay){
  let last;
  for(let i=0;i<tries;i++){ try{ return await fn(); }catch(e){ last=e; await sleep(delay); } }
  throw last;
}
let mgmtToken=null;
let createdRef=null; // reused if setup is retried after a failure, so we never create two projects
async function mgmt(path, opts={}){
  const r = await fetch(MGMT+path, { ...opts, headers: { Authorization: 'Bearer '+mgmtToken, 'Content-Type': 'application/json' } });
  const t = await r.text(); let body=null; try{ body = t ? JSON.parse(t) : null; }catch(e){ body=t; }
  if(!r.ok) throw new Error(body?.message || (typeof body==='string' && body) || 'Supabase API error '+r.status);
  return body;
}
function regionGroup(){
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if(/^America\//.test(tz)) return 'americas';
  if(/^(Asia|Australia|Pacific)\//.test(tz)) return 'apac';
  return 'emea';
}
function randomPassword(){ const a=new Uint8Array(24); crypto.getRandomValues(a); return Array.from(a, b=>b.toString(16).padStart(2,'0')).join(''); }
function log(msg){ const li=document.createElement('li'); li.textContent=msg; $('setupLog').append(li); }

async function loadAccount(){
  const token=$('setupToken').value.trim();
  if(!token.startsWith('sbp_')){ $('setupMsg').textContent='That doesn\'t look like an access token — it should start with sbp_.'; return; }
  mgmtToken=token; $('setupMsg').textContent='Checking your Supabase account…';
  try{
    const [orgs, projects] = await Promise.all([mgmt('/organizations'), mgmt('/projects')]);
    if(!orgs.length) throw new Error('No organization found — open the Supabase dashboard once to create one.');
    $('setupOrg').innerHTML = orgs.map(o=>`<option value="${esc(o.slug||o.id)}">${esc(o.name)}</option>`).join('');
    $('setupProject').innerHTML = '<option value="new">✨ Create a new “SaveBrain” project (recommended)</option>' +
      projects.filter(p=>p.status==='ACTIVE_HEALTHY').map(p=>`<option value="${esc(p.ref)}">Use existing: ${esc(p.name)}</option>`).join('');
    const syncOrg=()=>{ $('setupOrgLabel').hidden = $('setupProject').value!=='new' || orgs.length<2; };
    $('setupProject').onchange=syncOrg; syncOrg();
    $('setupStep2').hidden=false; $('setupMsg').textContent='';
  }catch(e){ mgmtToken=null; $('setupMsg').textContent='❌ '+e.message; }
}

async function runSetup(){
  const email=$('setupEmail').value.trim(), password=$('setupPassword').value;
  if(!email || password.length<6){ $('setupMsg').textContent='Enter an email and a password of at least 6 characters.'; return; }
  const choice=$('setupProject').value, isNew = choice==='new';
  const appUrl = location.origin + location.pathname;
  $('setupRunBtn').disabled=true; $('setupLoadBtn').disabled=true; $('setupLog').innerHTML=''; $('setupMsg').textContent='';
  try{
    let ref = isNew ? createdRef : choice;
    if(!ref){
      log('Creating your Supabase project…');
      const p = await mgmt('/projects', { method:'POST', body: JSON.stringify({ name:'SaveBrain', organization_slug: $('setupOrg').value, db_pass: randomPassword(), region_selection: { type:'smartGroup', code: regionGroup() } }) });
      ref=createdRef=p.ref;
    }
    log('Waiting for the project to start (usually 1–3 minutes)…');
    await retry(async()=>{ const p=await mgmt('/projects/'+ref); if(p.status!=='ACTIVE_HEALTHY') throw new Error('Project is still starting ('+p.status+'). Try again in a minute.'); }, 72, 5000);
    log('Creating the saves table and privacy rules…');
    const sql = await (await fetch('supabase/schema.sql')).text();
    await retry(()=>mgmt(`/projects/${ref}/database/query`, { method:'POST', body: JSON.stringify({ query: sql }) }), 12, 5000);
    log('Configuring sign-in…');
    const auth = await retry(()=>mgmt(`/projects/${ref}/config/auth`), 12, 5000);
    const allow = (auth.uri_allow_list||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(!allow.includes(appUrl)) allow.push(appUrl);
    const patch = { uri_allow_list: allow.join(',') };
    if(isNew || !auth.site_url || /localhost/.test(auth.site_url)) patch.site_url = appUrl;
    if(isNew) Object.assign(patch, { mailer_autoconfirm: true, disable_signup: false });
    await retry(()=>mgmt(`/projects/${ref}/config/auth`, { method:'PATCH', body: JSON.stringify(patch) }), 6, 5000);
    log('Getting your project key…');
    const keys = await retry(()=>mgmt(`/projects/${ref}/api-keys`), 12, 5000);
    let pub = keys.find(k=>k.type==='publishable' && k.api_key?.startsWith('sb_publishable_'));
    if(!pub) pub = await mgmt(`/projects/${ref}/api-keys`, { method:'POST', body: JSON.stringify({ type:'publishable', name:'savebrain' }) });
    const cfg = { url: `https://${ref}.supabase.co`, key: pub.api_key };
    log('Creating your SaveBrain account…');
    if(isNew) await sleep(8000); // let the auth settings above take effect
    const client = window.supabase.createClient(cfg.url, cfg.key);
    const { data, error } = await retry(async()=>{
      let res = await client.auth.signUp({ email, password, options: { emailRedirectTo: appUrl } });
      if(res.error && /registered|exists/i.test(res.error.message)) res = await client.auth.signInWithPassword({ email, password });
      if(res.error && (!res.error.status || res.error.status>=500)) throw res.error;
      return res;
    }, 6, 5000);
    if(error) throw error;
    if(isNew){
      log('Locking sign-ups so only you can use this project…');
      await retry(()=>mgmt(`/projects/${ref}/config/auth`, { method:'PATCH', body: JSON.stringify({ disable_signup: true, mailer_autoconfirm: false }) }), 6, 5000);
    }
    if(!saveConfig(cfg)) throw new Error('Could not save settings in this browser (private mode?).');
    mgmtToken=null; $('setupToken').value='';
    log(data.session ? '✅ All done! Opening SaveBrain…' : '📧 All done! Confirm your email, then sign in.');
    setTimeout(()=>location.reload(), 2500);
  }catch(e){
    $('setupMsg').textContent='❌ '+e.message+' — click “Set up SaveBrain” again to continue where it stopped.';
    $('setupRunBtn').disabled=false; $('setupLoadBtn').disabled=false;
  }
}

function saveManualConfig(e){
  e.preventDefault();
  const url=$('setupUrl').value.trim().replace(/\/+$/,''), key=$('setupKey').value.trim();
  if(!/^https:\/\/[^\s/]+$/i.test(url)){ $('manualMsg').textContent='Enter your project URL, e.g. https://abcd.supabase.co'; return; }
  if(key.startsWith('sb_secret_') || /service_role/.test(key)){ $('manualMsg').textContent='⛔ That is a SECRET key. Never paste it in a browser — use the publishable (sb_publishable_...) key.'; return; }
  if(!key.startsWith('sb_publishable_')){ $('manualMsg').textContent='Use the publishable key (starts with sb_publishable_).'; return; }
  if(!saveConfig({ url, key })){ $('manualMsg').textContent='Could not save settings in this browser (private mode?).'; return; }
  location.reload();
}

function showSetup(){
  $('setupView').hidden=false; $('authView').hidden=true; $('appView').hidden=true; $('signOutBtn').hidden=true;
  $('backendStatus').textContent='Not set up yet';
  $('setupLoadBtn').onclick=loadAccount;
  $('setupRunBtn').onclick=runSetup;
  $('setupForm').onsubmit=saveManualConfig;
}
