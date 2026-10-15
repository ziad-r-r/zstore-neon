
const API = '';
const S = {unlocked:false, products:[], orders:[], cart:[], sel:{}, q:'', sort:'', oq:'', of:'', tab:'orders', edit:null, units:[], curPid:''};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => Math.max(0, Number(v) || 0);
const money = n => (Math.round((Number(n)||0)*100)/100 + 0).toLocaleString('ar-EG') + ' جنيه';
const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g,'') : Date.now().toString(36) + Math.random().toString(36).slice(2));
const arr = v => Array.isArray(v) ? v : String(v||'').split(/[,،]/).map(x=>x.trim()).filter(Boolean);
const unitTotal = x => num(x.price);
const unitFor = (p, qty) => (qty > 1 && num(p.price2) > 0) ? num(p.price2) : num(p.price);
const STATUS = {new:'جديد',awaiting_shipping:'بانتظار تحديد الشحن',awaiting_customer:'بانتظار تأكيد العميل',confirmed:'تم التأكيد',rejected:'مرفوض',preparing:'قيد التجهيز',shipped:'تم الشحن',completed:'مكتمل',cancelled:'ملغي'};
const DELIVERY_FEE = 80;
const STORES = ['لا شيء','فرع القاهرة','فرع الإسكندرية'];
const SHIP_STAGES = ['تم تجهيز الشحنة','وصلت لمركز الفرز','خرجت للتوصيل','تم التسليم للعميل'];
const LBL = {...STATUS, preparing:'قيد التجهيز', shipped:'خرج مع المندوب', late:'متأخر — لم يخرج بعد'};
const openIds = new Set();

async function api(path, opts={}) {
  const r = await fetch(API + path, {
    headers: {'Content-Type':'application/json', ...(opts.headers||{})},
    ...opts,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || ('خطأ ' + r.status));
  return data;
}

function toast(t){const el=$('#toast');el.textContent=t;el.style.display='block';clearTimeout(el._t);el._t=setTimeout(()=>el.style.display='none',2500)}
function render(h){$('#app').innerHTML=h}
function loadCart(){try{return JSON.parse(localStorage.getItem('zs_cart')||'[]')}catch{return[]}}
function saveCart(){try{localStorage.setItem('zs_cart',JSON.stringify(S.cart))}catch{} $('#cc').textContent=S.cart.reduce((a,i)=>a+i.qty,0)}
const prodById = id => S.products.find(p=>p.id===id);

async function loadProducts(){ S.products = await api('/api/products'); }
async function loadOrders(){ S.orders = await api('/api/orders'); }

function breakdown(items, delivery=0){
  const b={base:0}; for(const i of items) b.base += num(i.base)*i.qty;
  b.delivery=num(delivery); b.total=b.base+b.delivery; return b;
}
function bdHtml(b){
  return `<div class="line"><span>السعر الأساسي</span><span>${money(b.base)}</span></div>
    <div class="line"><span>رسوم التوصيل</span><span>${money(b.delivery)}</span></div>
    <div class="line total"><span>الإجمالي</span><span>${money(b.total)}</span></div>`;
}
function cartQtyOf(pid){return S.cart.filter(i=>i.pid===pid).reduce((a,i)=>a+i.qty,0)}
function freshItems(){
  const out=[];
  for(const i of S.cart){ const p=prodById(i.pid); if(!p) continue;
    out.push({pid:p.id,name:p.name,image:p.image||'',color:i.color,size:i.size,qty:i.qty,base:unitFor(p,cartQtyOf(p.id)),stock:num(p.stock)}); }
  return out;
}
function derivedStatus(o){
  if(['cancelled','rejected'].includes(o.status)) return o.status;
  const stage = o.shipping?.stage ?? -1;
  if(stage>=3) return 'completed';
  if(stage>=2) return 'shipped';
  const h=(Date.now()-new Date(o.createdAt).getTime())/3600000;
  return h<1?'new':(h<24?'preparing':'late');
}
function dotsHtml(id, stage, interactive){
  const dots = SHIP_STAGES.map((s,i)=>{
    const on = i<=stage ? ' on' : '';
    return interactive
      ? `<span class="dot${on}" data-act="stage" data-id="${id}" data-i="${i}" title="${s}"></span>`
      : `<span class="dot${on}"></span>`;
  }).join('<span class="bar"></span>');
  return `<div class="dots">${dots}</div><div class="muted">${stage>=0?SHIP_STAGES[stage]:'لم تبدأ الشحنة بعد'}</div>`;
}
function statusBlock(o){ return `<h2>حالة الطلب</h2>${dotsHtml(o.id, o.shipping?.stage??-1, false)}`; }

function homePage(){
  const q=S.q.trim();
  let ps=S.products.filter(p=>!q||p.name.includes(q)||(p.description||'').includes(q));
  if(S.sort==='asc') ps.sort((a,b)=>unitTotal(a)-unitTotal(b));
  if(S.sort==='desc') ps.sort((a,b)=>unitTotal(b)-unitTotal(a));
  const empty = S.products.length ? 'لا توجد نتائج.' : 'لا توجد منتجات بعد. أضف منتجات من صفحة الإدارة.';
  render(`<div class="row" style="margin-bottom:12px"><input id="q" placeholder="ابحث عن منتج…" value="${esc(S.q)}"><select id="sort"><option value="">الترتيب الافتراضي</option><option value="asc">السعر: من الأقل</option><option value="desc">السعر: من الأعلى</option></select></div>
  ${ps.length?`<div class="grid">${ps.map(p=>`<a class="prod" href="#/p/${esc(p.id)}"><img class="img" src="${esc(p.image)}" alt="" onerror="this.style.visibility='hidden'"><div class="pad"><div>${esc(p.name)}</div><div class="price">${money(unitTotal(p))}</div></div></a>`).join('')}</div>`:`<div class="card muted">${empty}</div>`}`);
  const s=$('#sort'); if(s) s.value=S.sort;
}

function productPage(id){
  const p=prodById(id);
  if(!p) return render('<div class="card">المنتج غير موجود.</div>');
  S.sel={}; S.units=[]; S.curPid=id;
  const chips=(list,kind)=>arr(list).map(v=>`<span class="chip" data-act="pick" data-kind="${kind}" data-v="${esc(v)}">${esc(v)}</span>`).join('')||'<span class="muted">غير محدد</span>';
  render(`<div class="row" style="align-items:flex-start"><div style="flex:1 1 300px"><img class="img" style="border-radius:14px" src="${esc(p.image)}" alt="" onerror="this.style.visibility='hidden'"></div>
  <div class="card" style="flex:1 1 300px"><h1 style="margin:0">${esc(p.name)}</h1><p class="muted">${esc(p.description)}</p>
  <div class="price" style="font-size:22px">${money(unitTotal(p))}</div>
  <label>اللون</label><div class="chips">${chips(p.colors,'color')}</div>
  <label>المقاس</label><div class="chips">${chips(p.sizes,'size')}</div>
  <label>الكمية</label><input type="number" id="qty" min="1" value="1"><div id="units"></div>
  <div class="muted">المتاح: ${num(p.stock)}</div>
  <button data-act="add" data-id="${esc(p.id)}" ${num(p.stock)<1?'disabled':''}>أضف إلى السلة</button></div></div>`);
}

function unitList(p,n){
  const colors=arr(p.colors), sizes=arr(p.sizes), out=[];
  for(let i=0;i<n;i++){ const u=n>1?(S.units[i]||{}):{color:S.sel.color,size:S.sel.size};
    out.push({color:colors.length?(u.color||''):'', size:sizes.length?(u.size||''):''}); }
  return out;
}
function renderUnits(){
  const el=$('#units'); if(!el) return;
  const p=prodById(S.curPid); const n=Math.floor(num($('#qty')?.value));
  if(!p||n<2){el.innerHTML='';return}
  const colors=arr(p.colors), sizes=arr(p.sizes);
  for(let i=0;i<n;i++) S.units[i]=S.units[i]||{color:S.sel.color||'',size:S.sel.size||''};
  S.units.length=n;
  el.innerHTML='<h2 style="margin-top:12px">اختار اللون والمقاس لكل قطعة</h2>'+Array.from({length:n},(_,i)=>{
    const u=S.units[i];
    const ch=(list,kind)=>list.map(v=>`<span class="chip${u[kind]===v?' on':''}" data-act="upick" data-u="${i}" data-kind="${kind}" data-v="${esc(v)}">${esc(v)}</span>`).join('');
    return `<div class="card" style="padding:10px;margin-bottom:8px"><strong>القطعة ${i+1}</strong>${colors.length?`<div class="chips">${ch(colors,'color')}</div>`:''}${sizes.length?`<div class="chips">${ch(sizes,'size')}</div>`:''}</div>`;
  }).join('');
}
function addToCart(p){
  const qty=Math.floor(num($('#qty').value));
  if(qty<1) return toast('الكمية غير صحيحة');
  if(cartQtyOf(p.id)+qty>num(p.stock)) return toast('الكمية أكبر من المتاح');
  const units=unitList(p,qty), colors=arr(p.colors), sizes=arr(p.sizes);
  if(units.some(u=>(colors.length&&!u.color)||(sizes.length&&!u.size))) return toast('اختر اللون والمقاس لكل قطعة');
  for(const u of units){ const same=S.cart.find(i=>i.pid===p.id&&i.color===u.color&&i.size===u.size);
    if(same) same.qty+=1; else S.cart.push({pid:p.id,color:u.color,size:u.size,qty:1}); }
  S.units=[]; saveCart(); toast('تمت الإضافة للسلة'); location.hash='#/cart';
}
