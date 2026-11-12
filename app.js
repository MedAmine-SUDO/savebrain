const CONFIG_KEY='savebrain_config';
const $ = id => document.getElementById(id);
// Deployed config.js (optional) wins; otherwise use what this browser saved in the setup screen.
function getConfig(){
  if(window.SAVEBRAIN_SUPABASE_URL && window.SAVEBRAIN_SUPABASE_KEY) return { url: window.SAVEBRAIN_SUPABASE_URL, key: window.SAVEBRAIN_SUPABASE_KEY, deployed: true };
  try{ const c=JSON.parse(localStorage.getItem(CONFIG_KEY)); if(c?.url && c?.key) return c; }catch(e){}
  return null;
}
function saveConfig(c){ try{ localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); return true; }catch(e){ return false; } }
function clearConfig(){ try{ localStorage.removeItem(CONFIG_KEY); }catch(e){} }
let sb=null;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => /^https?:\/\//i.test(u || '') ? esc(u) : '#';
let allItems=[]; let filter='all'; let user=null;
function renderItems(items){
  allItems=items;
  let filtered=items;
  if(filter==='todo') filtered=items.filter(i=>i.status==='todo');
  if(filter==='done') filtered=items.filter(i=>i.status==='done');
  if(filter==='HIGH') filtered=items.filter(i=>i.urgency==='HIGH');
  if(filter==='CHECK') filtered=items.filter(i=>i.trust==='CHECK CLAIMS');
  $('count').textContent = `${filtered.length} of ${items.length} saves`;
  const list=$('list');
  if(!filtered.length){ list.innerHTML='<div class="card">No saves in this filter.</div>'; return; }
  list.innerHTML = filtered.map(i=>`
    <div class="item"><div class="meta"><span class="pill">${esc(i.platform||'instagram')}</span><span class="pill">${esc(i.category||'Needs Review')}</span><span class="pill ${i.urgency==='HIGH'?'high':''}">Urgency: ${esc(i.urgency||'MEDIUM')}</span><span class="pill ${i.trust==='CHECK CLAIMS'?'check':''}">Trust: ${esc(i.trust||'CHECK CLAIMS')}</span>${i.deadline?`<span class="pill">📅 ${esc(i.deadline)}</span>`:''}</div>
    <h3>${esc(i.title||'Saved Post')}</h3><p><b>@${esc(i.author||'Unknown')}</b> • ${esc(i.summary)}</p><p><b>Next:</b> ${esc(i.action||'Open original + analyze')}</p><p><a href="${safeUrl(i.url)}" target="_blank" rel="noopener noreferrer">Open original ↗</a> • ${i.created_at?new Date(i.created_at).toLocaleDateString():''}</p>
    <div class="actions"><button data-toggle="${esc(i.id)}" data-status="${esc(i.status)}">Mark ${i.status==='done'?'To Do':'Done'}</button><button data-del="${esc(i.id)}">Delete</button></div></div>`).join('');
}
async function loadItems(){
  const { data, error } = await sb.from('savebrain_items').select('*').order('created_at', { ascending: false });
  if(error){ $('list').innerHTML='<div class="card">Supabase error — make sure you ran supabase/schema.sql (see README.md).</div>'; $('backendStatus').textContent='❌ Supabase error'; return; }
  $('backendStatus').textContent = `✅ ${user.email} — ${data.length} saves`;
  renderItems(data);
}
async function toggleDone(id, status){
  await sb.from('savebrain_items').update({ status: status==='done'?'todo':'done' }).eq('id', id); loadItems();
}
async function delItem(id){
  if(!confirm('Delete this save?')) return;
  await sb.from('savebrain_items').delete().eq('id', id); loadItems();
}
function showView(session){
  user = session?.user || null;
  $('setupView').hidden = true; $('authView').hidden = !!user; $('appView').hidden = !user; $('signOutBtn').hidden = !user;
  if(user) loadItems(); else $('backendStatus').textContent='Signed out';
}
async function auth(mode){
  const email=$('authEmail').value.trim(), password=$('authPassword').value;
  if(!email || password.length<6){ $('authMsg').textContent='Enter an email and a password of at least 6 characters.'; return; }
  $('authMsg').textContent = mode==='up' ? 'Creating account…' : 'Signing in…';
  const { data, error } = mode==='up'
    ? await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
    : await sb.auth.signInWithPassword({ email, password });
  if(error){ $('authMsg').textContent='❌ '+error.message; return; }
  $('authMsg').textContent = mode==='up' && !data.session ? '📧 Check your email to confirm your account, then sign in.' : '';
}
function showSetup(){
  $('setupView').hidden=false; $('authView').hidden=true; $('appView').hidden=true; $('signOutBtn').hidden=true;
  $('backendStatus').textContent='Not connected';
  $('setupForm').onsubmit=e=>{ e.preventDefault();
    const url=$('setupUrl').value.trim().replace(/\/+$/,''), key=$('setupKey').value.trim();
    if(!/^https:\/\/[^\s/]+$/i.test(url)){ $('setupMsg').textContent='Enter your project URL, e.g. https://abcd.supabase.co'; return; }
    if(key.startsWith('sb_secret_') || /service_role/.test(key)){ $('setupMsg').textContent='⛔ That is a SECRET key. Never paste it in a browser — use the publishable (sb_publishable_...) key.'; return; }
    if(!key.startsWith('sb_publishable_')){ $('setupMsg').textContent='Use the publishable key (starts with sb_publishable_).'; return; }
    if(!saveConfig({ url, key })){ $('setupMsg').textContent='Could not save settings in this browser (private mode?).'; return; }
    location.reload();
  };
}
document.addEventListener('DOMContentLoaded', async ()=>{
  const cfg=getConfig();
  if(!cfg) return showSetup();
  sb = window.supabase.createClient(cfg.url, cfg.key);
  $('resetConfigBtn').hidden = !!cfg.deployed;
  $('resetConfigBtn').onclick=async()=>{ await sb.auth.signOut(); clearConfig(); location.reload(); };
  const params=new URLSearchParams(location.search);
  const shared=params.get('shared_url')||params.get('url')||params.get('text');
  if(shared){ $('urlInput').value=shared; $('addMsg').textContent='✅ Shared from Instagram/Facebook — tap Analyze & File.'; }
  $('authForm').onsubmit=e=>{ e.preventDefault(); auth('in'); };
  $('signUpBtn').onclick=()=>auth('up');
  $('signOutBtn').onclick=()=>sb.auth.signOut();
  sb.auth.onAuthStateChange((_event, session)=>setTimeout(()=>showView(session)));
  $('list').onclick=e=>{ const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.toggle) toggleDone(b.dataset.toggle, b.dataset.status);
    if(b.dataset.del) delItem(b.dataset.del); };
  document.querySelectorAll('.filters button').forEach(b=>b.onclick=()=>{ document.querySelectorAll('.filters button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); filter=b.dataset.filter; renderItems(allItems); });
  $('addBtn').onclick=async()=>{
    const url=$('urlInput').value.trim();
    if(!/^https?:\/\//i.test(url)){ $('addMsg').textContent='Paste a valid http(s) link first.'; return; }
    $('addMsg').textContent='Sending to Supabase…';
    const item={platform: url.includes('facebook')?'facebook':'instagram', url, author:'Unknown', title:'Shared Save — needs review', summary:'Shared via Share Sheet.', category:'Needs Review', urgency:'MEDIUM', trust:'CHECK CLAIMS', action:'Open original + analyze', status:'todo', user_id:user.id};
    const { error } = await sb.from('savebrain_items').insert(item);
    if(error){ $('addMsg').textContent='❌ Supabase error — '+error.message; return; }
    $('addMsg').textContent='✅ Filed to Supabase!'; $('urlInput').value=''; history.replaceState(null,'',location.pathname); await loadItems();
  };
});
