// SaveBrain — main app. Config and helpers ($, esc, getConfig, clearConfig, showSetup) come from setup.js.
const safeUrl = u => /^https?:\/\//i.test(u || '') ? esc(u) : '#';
const clip = (v, n) => v == null || v === '' ? null : String(v).slice(0, n);
let sb=null; let allItems=[]; let filter='all'; let user=null;

const PROMPT_FIELDS = `Reply with ONLY a JSON array and no other text. One object per saved post:
{"url": "direct link to the post", "platform": "instagram" or "facebook", "author": "account name", "title": "short title", "summary": "1-2 sentence summary", "category": "short topic", "urgency": "HIGH", "MEDIUM" or "LOW", "deadline": "YYYY-MM-DD if the post mentions one, otherwise empty", "action": "the next step I should take"}
Only include posts you can actually see in my saved items, with their real links. Never invent posts or links. If you can't access my saved posts, reply exactly: NO ACCESS`;
const PROMPTS = {
  all: `List all my saved posts on Instagram and Facebook.\n${PROMPT_FIELDS}`,
  daily: `List the posts I saved on Instagram and Facebook in the last 24 hours.\n${PROMPT_FIELDS}`,
};

function normalizeUrl(u){
  try{
    const x = new URL(String(u).trim());
    if(!/^https?:$/.test(x.protocol)) return null;
    if(/(^|\.)instagram\.com$/.test(x.hostname)){ x.hostname='www.instagram.com'; x.search=''; } // drop ?igsh= share tracking
    x.hash='';
    return x.origin + (x.pathname.replace(/\/+$/,'') || '/') + x.search;
  }catch(e){ return null; }
}
function platformOf(url){
  if(/instagram\.com/.test(url)) return 'instagram';
  if(/facebook\.com|fb\.watch|fb\.com/.test(url)) return 'facebook';
  return 'other';
}
function toItem(r, url){
  r = r && typeof r==='object' ? r : {};
  const urgency = String(r.urgency||'').toUpperCase();
  return { url, platform: platformOf(url), author: (clip(r.author,100)||'Unknown').replace(/^@/,''), title: clip(r.title,200)||'Saved post — needs review',
    summary: clip(r.summary,1000)||'', category: clip(r.category,60)||'Needs Review', urgency: ['HIGH','MEDIUM','LOW'].includes(urgency)?urgency:'MEDIUM',
    trust: 'CHECK CLAIMS', deadline: clip(r.deadline,40), action: clip(r.action,300)||'Open original + review', status: 'todo', user_id: user.id };
}
// Accepts Meta AI's reply: a JSON array (even wrapped in text or ``` fences), or failing that, any links in the text.
function parseMetaReply(text){
  const t = text.trim();
  if(/^NO ACCESS/i.test(t)) return { noAccess: true, items: [] };
  let rows=null; const a=t.indexOf('['), b=t.lastIndexOf(']');
  if(a>=0 && b>a){ try{ rows=JSON.parse(t.slice(a, b+1)); }catch(e){} }
  if(!Array.isArray(rows)) rows = (t.match(/https?:\/\/[^\s"'<>)\]]+/g) || []);
  const seen=new Set(), items=[];
  for(const r of rows){
    const url = normalizeUrl(typeof r==='string' ? r : r?.url);
    if(!url || seen.has(url)) continue;
    seen.add(url); items.push(toItem(r, url));
  }
  return { items };
}
async function fileItems(items){
  const { data, error } = await sb.from('savebrain_items').upsert(items, { onConflict: 'user_id,url', ignoreDuplicates: true }).select('id');
  if(error) throw error;
  return data.length;
}

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
  if(error){ $('list').innerHTML='<div class="card">Supabase error — '+esc(error.message)+'</div>'; $('backendStatus').textContent='❌ Supabase error'; return; }
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
async function copyPrompt(kind){
  const text=PROMPTS[kind];
  try{ await navigator.clipboard.writeText(text); $('importMsg').textContent='📋 Prompt copied — paste it into Meta AI.'; }
  catch(e){ $('promptPreview').textContent=text; $('promptPreview').hidden=false; $('importMsg').textContent='Copy the prompt below and paste it into Meta AI.'; }
}

document.addEventListener('DOMContentLoaded', async ()=>{
  const params=new URLSearchParams(location.search);
  const shared=params.get('shared_url')||params.get('url')||params.get('text');
  if(shared){ $('urlInput').value=shared; $('addMsg').textContent='✅ Shared from Instagram/Facebook — tap Analyze & File.'; }
  const cfg=getConfig();
  if(!cfg) return showSetup();
  sb = window.supabase.createClient(cfg.url, cfg.key);
  document.querySelectorAll('.resetConfigBtn').forEach(b=>b.onclick=async()=>{
    if(!confirm('Disconnect this Supabase project from SaveBrain in this browser? Your saves stay in Supabase.')) return;
    await sb.auth.signOut(); clearConfig(); location.reload();
  });
  $('authForm').onsubmit=e=>{ e.preventDefault(); auth('in'); };
  $('signUpBtn').onclick=()=>auth('up');
  $('signOutBtn').onclick=()=>sb.auth.signOut();
  sb.auth.onAuthStateChange((_event, session)=>setTimeout(()=>showView(session)));
  $('list').onclick=e=>{ const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.toggle) toggleDone(b.dataset.toggle, b.dataset.status);
    if(b.dataset.del) delItem(b.dataset.del); };
  document.querySelectorAll('.filters button').forEach(b=>b.onclick=()=>{ document.querySelectorAll('.filters button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); filter=b.dataset.filter; renderItems(allItems); });
  $('copyAllPrompt').onclick=()=>copyPrompt('all');
  $('copyDailyPrompt').onclick=()=>copyPrompt('daily');
  $('importBtn').onclick=async()=>{
    const { noAccess, items } = parseMetaReply($('importText').value);
    if(noAccess){ $('importMsg').textContent='Meta AI said it can\'t access your saved posts. Try in the Instagram app\'s Meta AI chat, or add links one by one above.'; return; }
    if(!items.length){ $('importMsg').textContent='No post links found in that text. Paste Meta AI\'s whole reply.'; return; }
    $('importMsg').textContent=`Importing ${items.length} posts…`;
    try{
      const added = await fileItems(items);
      $('importMsg').textContent=`✅ Imported ${added} new saves${items.length>added?` (${items.length-added} were already in SaveBrain)`:''}.`;
      $('importText').value=''; await loadItems();
    }catch(e){ $('importMsg').textContent='❌ Supabase error — '+e.message; }
  };
  $('addBtn').onclick=async()=>{
    const url=normalizeUrl($('urlInput').value);
    if(!url){ $('addMsg').textContent='Paste a valid http(s) link first.'; return; }
    $('addMsg').textContent='Sending to Supabase…';
    try{
      const added = await fileItems([toItem({ summary: 'Shared via Share Sheet.' }, url)]);
      $('addMsg').textContent = added ? '✅ Filed to Supabase!' : 'ℹ️ Already in SaveBrain.';
      $('urlInput').value=''; history.replaceState(null,'',location.pathname); await loadItems();
    }catch(e){ $('addMsg').textContent='❌ Supabase error — '+e.message; }
  };
});
