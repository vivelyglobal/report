'use strict';
const COLUMNS = ['post_url','posted_date','likes','comments','views','reposts','post_er'];
const LABELS = {post_url:'게시물 URL',posted_date:'게시일',likes:'좋아요',comments:'댓글',views:'조회수',reposts:'리포스트',post_er:'반응률',posts:'게시물 수'};
const $ = id => document.getElementById(id);
const nf = new Intl.NumberFormat('ko-KR');
let rows = [], source = null, sortKey = 'views', ascending = false, requestVersion = 0;
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function number(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(String(value).replace(/,/g,'').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const RATIO_ER_TABS = new Set(['1AU9GO4lON-xGUkCVfI1aPjCwAJZUCL8bSGosEk0A27M:141019346']);
function rate(cell, unit = 'points') {
  if (!cell) return null;
  // Formatted percent cells retain the sheet's display units; unformatted numbers are percentage points.
  if (typeof cell.f === 'string' && cell.f.includes('%')) return number(cell.f.replace('%',''));
  if (typeof cell.v === 'string' && cell.v.includes('%')) return number(cell.v.replace('%',''));
  const value = number(cell.v);
  return value === null ? null : value * (unit === 'ratio' ? 100 : 1);
}
function date(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  const g = text.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})(?:,.*)?\)$/);
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  const parts = g ? [+g[1],+g[2]+1,+g[3]] : iso ? [+iso[1],+iso[2],+iso[3]] : null;
  if (!parts) return null;
  const [y,m,d] = parts, check = new Date(Date.UTC(y,m-1,d));
  return check.getUTCFullYear()===y && check.getUTCMonth()===m-1 && check.getUTCDate()===d ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` : null;
}
function safeURL(value) { try {const u = new URL(String(value).trim()); return ['http:','https:'].includes(u.protocol) ? u.href : null;} catch {return null;} }
function parseTable(table, erUnit = 'points') {
  if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) throw new Error('시트 응답을 읽을 수 없습니다. 공유 권한과 탭 링크를 확인해주세요.');
  const normalize = x => String(x ?? '').trim().toLowerCase();
  let names = table.cols.map(c => normalize(c.label)), data = table.rows;
  if (!COLUMNS.every(c => names.includes(c))) {
    const first = data[0]?.c?.map(c => normalize(c?.v)) || [];
    if (COLUMNS.every(c => first.includes(c))) {names = first; data = data.slice(1);}
  }
  const missing = COLUMNS.filter(c => !names.includes(c));
  if (missing.length) throw new Error(`필수 열이 없습니다: ${missing.join(', ')}. 첫 행의 열 이름을 확인해주세요.`);
  const indexes = Object.fromEntries(COLUMNS.map(c => [c,names.indexOf(c)]));
  return data.flatMap(row => {
    const cells = row.c || [], cell = key => cells[indexes[key]], url = cell('post_url')?.v;
    if (url == null || !String(url).trim()) return [];
    const result = {post_url:String(url).trim(), href:safeURL(url), posted_date:date(cell('posted_date')?.v), post_er:rate(cell('post_er'), erUnit)};
    for (const key of ['likes','comments','views','reposts']) result[key] = number(cell(key)?.v);
    return [result];
  });
}
function fetchSheet(sheet, gid) {
  return new Promise((resolve,reject) => {
    const callback = `vively_${Math.random().toString(36).slice(2)}`, script = document.createElement('script');
    const cleanup = () => {clearTimeout(timer); script.remove(); delete window[callback];};
    const timer = setTimeout(() => {cleanup(); reject(new Error('시트 응답 시간이 초과되었습니다. 공유 권한을 확인하고 다시 시도해주세요.'));},20000);
    window[callback] = response => {cleanup(); try {if (response.status === 'error') throw new Error('시트를 불러올 수 없습니다. 공유 권한과 탭 링크를 확인해주세요.'); resolve(parseTable(response.table, RATIO_ER_TABS.has(`${sheet}:${gid}`) ? 'ratio' : 'points'));} catch(e) {reject(e);}};
    script.onerror = () => {cleanup(); reject(new Error('시트 연결에 실패했습니다. 네트워크 및 시트 공유 권한을 확인해주세요.'));};
    script.src = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheet)}/gviz/tq?gid=${encodeURIComponent(gid)}&headers=1&tqx=${encodeURIComponent(`responseHandler:${callback}`)}`;
    document.head.appendChild(script);
  });
}
const format = (v,key) => v === null ? '—' : key === 'post_er' ? `${v.toFixed(2)}%` : nf.format(v);
const average = data => {const valid = data.map(r=>r.post_er).filter(v=>v!==null);return valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : null;};
const sum = (data,key) => {const valid = data.map(r=>r[key]).filter(v=>v!==null);return valid.length ? valid.reduce((a,b)=>a+b,0) : null;};
function link(row) {return row.href ? `<a href="${escapeHTML(row.href)}" target="_blank" rel="noopener noreferrer" title="${escapeHTML(row.post_url)}">${escapeHTML(row.post_url)} ↗</a>` : `<span title="유효하지 않은 URL">${escapeHTML(row.post_url)}</span>`;}
function render() {
  $('brandMeta').textContent = source.brand;
  $('erMethod').textContent = '평균 반응률은 유효한 게시물별 반응률의 산술 평균입니다. 누락된 수치는 제외하며 조회수로 재계산하지 않습니다.';
  $('reportTitle').textContent = `${source.brand} 캠페인 성과 보고서`;
  document.title = `${source.brand} · VIVELY 성과 보고서`;
  const dates = rows.map(r=>r.posted_date).filter(Boolean).sort();
  $('periodMeta').textContent = dates.length ? `${dates[0]} — ${dates.at(-1)}` : '유효한 게시일 없음';
  const metrics = [['posts',rows.length],['views',sum(rows,'views')],['likes',sum(rows,'likes')],['comments',sum(rows,'comments')],['reposts',sum(rows,'reposts')],['post_er',average(rows)]];
  $('kpis').innerHTML = metrics.map(([key,value])=>`<div class="kpi ${['views','post_er'].includes(key)?'highlight':''}"><b>${format(value,key)}</b><span>${key==='post_er'?'평균 반응률':key==='posts'?'총 게시물':`총 ${LABELS[key]}`}</span></div>`).join('');
  const top = rows.filter(r=>r.views!==null).sort((a,b)=>b.views-a.views).slice(0,3);
  $('topPosts').innerHTML = top.length ? top.map((r,i)=>`<article class="post-card"><span class="tag">0${i+1} / TOP VIEWS</span><div class="post-link">${link(r)}</div><time>${r.posted_date || '게시일 없음'}</time><strong>${format(r.views,'views')}</strong><small>조회수</small><div class="mini-metrics">${['likes','comments','reposts','post_er'].map(k=>`<div>${LABELS[k]}<b>${format(r[k],k)}</b></div>`).join('')}</div></article>`).join('') : '<p class="empty">조회수 데이터가 없습니다.</p>';
  renderTable(); renderChart(); renderInsights();
}
function renderTable() {
  const filtered = rows.filter(r=>r.post_url.toLowerCase().includes($('search').value.toLowerCase()));
  filtered.sort((a,b)=>{
    const x=a[sortKey],y=b[sortKey]; if(x===null)return y===null?0:1;if(y===null)return -1;
    const cmp = typeof x==='number' ? x-y : x.localeCompare(y); return ascending?cmp:-cmp;
  });
  $('count').textContent = `${nf.format(filtered.length)} / ${nf.format(rows.length)} 게시물`;
  const order = ['post_url','posted_date','views','likes','comments','reposts','post_er'];
  $('tableHead').innerHTML = order.map(k=>`<th scope="col" aria-sort="${sortKey===k?(ascending?'ascending':'descending'):'none'}"><button data-sort="${k}">${LABELS[k]} ${sortKey===k?(ascending?'↑':'↓'):'↕'}</button></th>`).join('');
  $('tableBody').innerHTML = filtered.length ? filtered.map(r=>`<tr><td>${link(r)}</td><td>${r.posted_date||'—'}</td>${order.slice(2).map(k=>`<td>${format(r[k],k)}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="7" class="empty">표시할 게시물이 없습니다.</td></tr>';
}
function renderChart() {
  const key = $('metric').value, groups = new Map();
  for (const row of rows) if (row.posted_date) {if(!groups.has(row.posted_date))groups.set(row.posted_date,[]);groups.get(row.posted_date).push(row);}
  const points = [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([day,data])=>({day,value:key==='posts'?data.length:key==='post_er'?average(data):sum(data,key)}));
  $('chartTitle').textContent = LABELS[key];
  const undated = rows.filter(r=>!r.posted_date).length;
  $('dateNote').textContent = `게시일 기준 ${key==='post_er'?'산술 평균':'합계'} · ${undated ? `게시일이 없거나 올바르지 않은 게시물 ${nf.format(undated)}건은 차트에서 제외됩니다.` : '모든 게시물의 게시일이 반영되었습니다.'}`;
  if(!points.length || points.every(p=>p.value===null)) {$('chart').innerHTML='<p class="empty">선택한 지표와 게시일이 있는 데이터가 없습니다.</p>';return;}
  const max = Math.max(...points.map(p=>p.value||0),1), start=Date.parse(points[0].day), end=Date.parse(points.at(-1).day), x = p=>end===start?440:80+(Date.parse(p.day)-start)/(end-start)*740, y = v=>240-v/max*195;
  let svg = '';
  for(let i=0;i<=4;i++){const v=max*i/4, yy=y(v);svg+=`<line class="chart-grid" x1="80" x2="820" y1="${yy}" y2="${yy}"/><text class="chart-label" x="68" y="${yy+4}" text-anchor="end">${key==='post_er'?v.toFixed(1)+'%':new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(v)}</text>`;}
  const valid = points.filter(p=>p.value!==null);
  // Separate segments at missing metric values, rather than drawing a false zero.
  let segment=[];
  const draw=()=>{if(segment.length>1)svg+=`<polyline points="${segment.join(' ')}" fill="none" stroke="#2f63e9" stroke-width="3"/>`;segment=[];};
  for(const p of points){if(p.value===null){draw();continue;}segment.push(`${x(p)},${y(p.value)}`);}draw();
  for(const p of valid)svg+=`<circle cx="${x(p)}" cy="${y(p.value)}" r="4" fill="#2f63e9"><title>${p.day}: ${format(p.value,key)}</title></circle>`;
  const step=Math.max(1,Math.ceil(points.length/6));
  points.forEach((p,i)=>{if(i%step===0||i===points.length-1)svg+=`<text class="chart-label" x="${x(p)}" y="270" text-anchor="middle">${p.day.slice(5)}</text>`;});
  $('chart').innerHTML=`<div class="chart-scroll"><svg viewBox="0 0 860 290" role="img" aria-labelledby="chartDesc"><title id="chartDesc">게시일별 ${LABELS[key]} 추이</title>${svg}</svg></div>`;
}
function selectTab(id, focus=false) {
  if(!['overview','insights','timeline','posts'].includes(id))id='overview';
  document.querySelectorAll('[data-tab]').forEach(b=>{const selected=b.dataset.tab===id;b.setAttribute('aria-selected',selected);b.tabIndex=selected?0:-1;if(selected&&focus)b.focus();});
  document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==id);
  history.replaceState(null,'',`${location.pathname}${location.search}#${id}`);
}
function status(message,error=false) {$('status').hidden=!message;$('status').className=error?'error':'';$('status').textContent=message;}
async function load() {
  const version=++requestVersion;
  $('setup').hidden=true;$('main').hidden=true;status('게시물 성과를 불러오는 중입니다…');
  try {const data=await fetchSheet(source.sheet,source.gid);if(version!==requestVersion)return;rows=data;render();$('main').hidden=false;status(rows.length?'':'시트에 게시물 URL이 있는 행이 없습니다.');selectTab(location.hash.slice(1));}
  catch(e){if(version!==requestVersion)return;status(e.message,true);$('setup').hidden=false;}
}
$('connectForm').addEventListener('submit',e=>{
  e.preventDefault();const url=new URL($('sheetInput').value), match=url.pathname.match(/^\/spreadsheets\/d\/([\w-]+)(?:\/|$)/);
  if(url.hostname!=='docs.google.com'||!match){status('올바른 Google Sheets 링크를 입력해주세요.',true);return;}
  const gid = new URLSearchParams(url.hash.slice(1)).get('gid') || url.searchParams.get('gid') || '0';
  if(!/^\d+$/.test(gid)){status('시트 탭 ID(gid)를 확인해주세요.',true);return;}
  const brand=$('brandInput').value.trim();if(!brand)return;
  source={brand,sheet:match[1],gid};const params=new URLSearchParams(source);history.pushState(null,'',`${location.pathname}?${params}#overview`);load();
});
$('refresh').onclick=load;
$('search').addEventListener('input',renderTable);$('metric').addEventListener('change',renderChart);
$('tableHead').onclick=e=>{const b=e.target.closest('[data-sort]');if(!b)return;ascending=sortKey===b.dataset.sort?!ascending:false;sortKey=b.dataset.sort;renderTable();};
document.querySelectorAll('[data-tab]').forEach(b=>{b.onclick=()=>selectTab(b.dataset.tab);b.onkeydown=e=>{const ids=['overview','insights','timeline','posts'];let index=ids.indexOf(b.dataset.tab);if(e.key==='ArrowRight')index=(index+1)%ids.length;else if(e.key==='ArrowLeft')index=(index+ids.length-1)%ids.length;else if(e.key==='Home')index=0;else if(e.key==='End')index=ids.length-1;else return;e.preventDefault();selectTab(ids[index],true);};});
document.querySelector('[data-open]').onclick=()=>selectTab('posts',true);
window.addEventListener('hashchange',()=>selectTab(location.hash.slice(1)));
$('copyLink').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('copyLink').textContent='복사 완료 ✓';setTimeout(()=>$('copyLink').textContent='링크 복사',2000);}catch{status('링크를 복사하지 못했습니다. 주소창의 URL을 복사해주세요.',true);}};
$('export').onclick=()=>{
  const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  // Prefix spreadsheet formula characters in text cells for safe CSV import.
  const csvText=v=>/^[=+\-@\t\r\n]/.test(String(v))?"'"+v:v;
  const csv=[COLUMNS.join(','),...rows.map(r=>COLUMNS.map(k=>quote(k==='post_url'?csvText(r[k]):r[k])).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`${source.brand}_performance.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function init(){const params=new URLSearchParams(location.search),brand=params.get('brand')||params.get('name'),sheet=params.get('sheet'),gid=params.get('gid')||'0';
  if(brand){$('brandInput').value=brand;}
  if(brand&&(sheet||params.has('gid'))){source={brand,sheet:sheet||'1EsMCxiMoAxPa5zGFalBqknM-lB7kC166twgHO9_I_dk',gid};if(!/^[\w-]+$/.test(source.sheet)||!/^\d+$/.test(gid)){status('시트 ID 또는 탭 ID가 올바르지 않습니다.',true);return;}$('sheetInput').value=`https://docs.google.com/spreadsheets/d/${source.sheet}/edit#gid=${gid}`;load();}
}
window.addEventListener('popstate',()=>{requestVersion++;$('main').hidden=true;$('setup').hidden=false;status('');init();});
init();

function reelKey(value) {
  try {
    const u = new URL(value);
    if (!['http:','https:'].includes(u.protocol) || !['instagram.com','www.instagram.com'].includes(u.hostname)) return null;
    const match = u.pathname.match(/^\/(reel|reels|p)\/([\w-]+)\/?$/);
    return match ? `${match[1]==='p'?'p':'reel'}/${match[2]}` : null;
  } catch { return null; }
}
function campaignPayload(data) {
  const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [data];
  return campaigns.find(p=>p?.sheet === source.sheet && String(p.gid) === source.gid) || null;
}
function scopedRecords(data) {
  const payload = campaignPayload(data);
  if (!payload || payload.sheet !== source.sheet || String(payload.gid) !== source.gid || !Array.isArray(payload.posts)) return new Map();
  return new Map(payload.posts.flatMap(post=>{const key=reelKey(post.post_url);return key?[[key,post]]:[];}));
}
function renderInsights() {
  const collected = scopedRecords(window.VIVELY_REEL_INSIGHTS), reviews = scopedRecords(window.VIVELY_REEL_REVIEWS);
  const eligible = rows.filter(r=>reelKey(r.post_url));
  const unique = [...new Map(eligible.map(r=>[reelKey(r.post_url),r])).values()];
  const reviewed = unique.filter(r=>{const review=reviews.get(reelKey(r.post_url));return review?.summary && review?.evidence && review?.checked_at;}).length;
  $('insightCoverage').textContent = `Instagram 게시물 ${nf.format(unique.length)}개 · 캡션 분석 ${nf.format(reviewed)}개 · 캡션 발췌 확인 ${nf.format(unique.filter(r=>collected.get(reelKey(r.post_url))?.caption).length)}개`;
  renderCampaignFindings(reviews);
  if (!unique.length) {$('insightPosts').innerHTML='<p class="empty">시트에 분석할 Instagram 게시물 링크가 없습니다.</p>';return;}
  const ordered = unique.sort((a,b)=>(b.views??-1)-(a.views??-1));
  const validViews = rows.map(r=>r.views).filter(v=>v!==null).sort((a,b)=>a-b);
  const midpoint = Math.floor(validViews.length/2);
  const median = validViews.length ? validViews.length%2?validViews[midpoint]:(validViews[midpoint-1]+validViews[midpoint])/2 : null;
  $('insightPosts').innerHTML = ordered.map((row,index)=>{
    const key = reelKey(row.post_url), metadata = collected.get(key), review = reviews.get(key);
    const hasReview = Boolean(review?.summary && review?.evidence && review?.checked_at);
    const state = hasReview?(review.video_reviewed===true?'영상·콘텐츠 검토 완료':'캡션 분석 완료 · 영상 미확인'):metadata?.caption?'캡션 수집 · 분석 대기':metadata?.status==='unavailable'?'접근 불가 · 직접 확인 필요':metadata?.metadata_excerpt?'메타데이터 수집 · 검토 대기':'콘텐츠 확인 대기';
    const summary = hasReview ? `<div class="insight-block"><h4>${review.video_reviewed===true?'콘텐츠 요약':'캡션 기반 핵심 내용'}</h4><p>${escapeHTML(review.summary)}</p></div><div class="insight-block"><h4>확인한 근거</h4><p>${escapeHTML(review.evidence)}</p><p class="note">${review.video_reviewed===true?'영상 시청 포함':'영상 미확인 · 캡션/메타데이터 범위 분석'} · 검토일 ${escapeHTML(review.checked_at)}</p></div>` : '<p class="pending-review">이 캠페인의 콘텐츠 분석이 아직 준비되지 않았습니다. 캡션 수집과 검토가 완료되면 여기에 핵심 내용이 표시됩니다.</p>';
    const caption = metadata?.caption ? `<details><summary>${metadata.caption_is_excerpt ? '공개 메타데이터의 캡션 발췌' : '확인한 캡션 원문'}</summary><p class="caption-text">${escapeHTML(metadata.caption)}</p></details>` : '';
    const tags = Array.isArray(metadata?.hashtags) && metadata.hashtags.length ? `<div class="hashtags">${metadata.hashtags.map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}</div>` : '';
    const excerpt = !metadata?.caption && metadata?.metadata_excerpt ? `<details><summary>수집된 공개 메타데이터 · 캡션 검증 전</summary><p class="caption-text">${escapeHTML(metadata.metadata_excerpt)}</p></details>` : '';
    const hypotheses = hasReview && Array.isArray(review.hypotheses) && review.hypotheses.length ? `<div class="hypotheses"><h4>성과 요인 가설</h4><ul>${review.hypotheses.map(h=>`<li>${escapeHTML(h)}</li>`).join('')}</ul><p class="note">관찰에 기반한 해석입니다. 인과관계가 입증된 결과는 아닙니다.</p></div>` : '';
    const comparison = row.views!==null && median>0 ? `전체 게시물 조회수 중앙값 대비 ${(row.views/median).toFixed(2)}배` : '조회수 비교에 필요한 데이터가 충분하지 않습니다.';
    return `<article class="insight-card"><div class="insight-card-head"><span class="tag">POST ${String(index+1).padStart(2,'0')}</span><span class="review-state">${state}</span></div><div class="insight-url">${link(row)}</div><div class="insight-metrics"><span>조회수 <b>${format(row.views,'views')}</b></span><span>반응률 <b>${format(row.post_er,'post_er')}</b></span><span>리포스트 <b>${format(row.reposts,'reposts')}</b></span></div><p class="note">${comparison} · 게시물 성과 집계 기준</p>${summary}${caption}${tags}${excerpt}${hypotheses}${metadata?.checked_at?`<p class="note">원문 확인 시도: ${escapeHTML(metadata.checked_at)}</p>`:''}</article>`;
  }).join('');
}

function renderCampaignFindings(reviews) {
  const payload = campaignPayload(window.VIVELY_REEL_REVIEWS);
  const target = $('campaignFindings');
  target.innerHTML = '';
  if (!reviews.size || !Array.isArray(payload?.findings)) return;
  const currentKeys = new Set(rows.map(row=>reelKey(row.post_url)).filter(Boolean));
  const findings = payload.findings.filter(f=>Array.isArray(f.post_urls) && f.post_urls.length && f.post_urls.every(url=>currentKeys.has(reelKey(url))));
  if (!findings.length) return;
  target.innerHTML = `<div class="section-head"><div><h3>캠페인 핵심 인사이트</h3><p class="sub">${escapeHTML(payload.reviewed_at || '')} 검토 · 공개 캡션 발췌와 검토 당시 성과 기준</p></div></div><div class="campaign-findings">${findings.map((f,i)=>`<article><span class="tag">INSIGHT 0${i+1}</span><h4>${escapeHTML(f.title)}</h4><p>${escapeHTML(f.text)}</p><div class="finding-sources">${f.post_urls.map((url,j)=>`<a href="${escapeHTML(safeURL(url))}" target="_blank" rel="noopener noreferrer">근거 게시물 ${j+1} ↗</a>`).join('')}</div></article>`).join('')}</div>`;
}
