let SITE_META = {};
let MANIFEST = { days: [] };
let SEARCH_DB = null;
const DAY_CACHE = new Map();

let currentView = 'daily';
let currentDate = null;
let currentLedger = null;
let activeCat = 'all';
let activeTier = 'all';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('adong_daily_theme', theme); } catch (e) {}
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.setTheme === theme);
  });
}

async function fetchJson(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${path}`);
  return resp.json();
}

function renderSourceLinks(sources) {
  return (sources || []).slice(0, 4).map(s => {
    const h = s.heat ? ` (${s.heat}${s.heat_unit || ''})` : '';
    return `<a class="src-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}${esc(h)} ↗</a>`;
  }).join('<span style="color:var(--border-strong)">·</span>');
}

function switchView(view, skipHash) {
  currentView = view;
  document.getElementById('tab-daily').classList.toggle('active', view === 'daily');
  document.getElementById('tab-archive').classList.toggle('active', view === 'archive');
  document.getElementById('view-daily').style.display = view === 'daily' ? '' : 'none';
  document.getElementById('view-archive').style.display = view === 'archive' ? '' : 'none';

  if (view === 'archive') {
    if (!skipHash) location.hash = '#/archive';
    ensureSearchLoaded().then(renderArchive);
  } else if (!skipHash && currentDate) {
    location.hash = `#/${currentDate}`;
  }
}

async function ensureSearchLoaded() {
  if (SEARCH_DB) return;
  try {
    const data = await fetchJson('data/search.json');
    SEARCH_DB = data.items || [];
  } catch (e) {
    SEARCH_DB = [];
  }
}

function goDate(dateStr) {
  if (!dateStr) return;
  location.hash = `#/${dateStr}`;
}

function stepDay(delta) {
  const days = MANIFEST.days || [];
  const idx = days.findIndex(d => d.date === currentDate);
  if (idx < 0) return;
  const target = days[idx + delta];
  if (target) goDate(target.date);
}

async function loadDay(dateStr) {
  currentDate = dateStr;
  document.getElementById('date-select').value = dateStr;

  const days = MANIFEST.days || [];
  const idx = days.findIndex(d => d.date === dateStr);
  document.getElementById('btn-prev').disabled = idx < 0 || idx >= days.length - 1;
  document.getElementById('btn-next').disabled = idx <= 0;

  if (!DAY_CACHE.has(dateStr)) {
    const data = await fetchJson(`data/daily/${dateStr}.json`);
    DAY_CACHE.set(dateStr, data);
  }
  currentLedger = DAY_CACHE.get(dateStr);
  activeCat = 'all';
  activeTier = 'all';
  document.getElementById('search-box').value = '';
  syncPills();
  renderDailyPage();
}

function renderDailyPage() {
  const L = currentLedger;
  if (!L) return;

  const siteTitle = SITE_META.site_title || '阿东 AI 日报';
  document.title = `${siteTitle} · ${L.date} ${L.weekday || ''}`;
  document.getElementById('hero-title').textContent = `${siteTitle} · ${L.date} ${L.weekday || ''}`;
  document.getElementById('hero-sub').textContent =
    `${SITE_META.author_name || '阿东玩 AI'} ｜ ${SITE_META.subtitle || ''} ｜ 更新于 ${L.update_time || L.date}`;
  document.getElementById('daily-take').textContent = L.daily_take || '';

  const st = L.stats || {};
  const pills = [
    `📡 连通 ${st.ok_sources || 0}/${st.total_sources || 0} 信源`,
    `📥 原始 ${st.raw_articles || 0} 篇`,
    `🔥 跨源共振 ${st.multi_source_clusters || 0} 起`,
    `✨ 精选 ${st.selected_count || (L.items || []).length} 条`
  ];
  document.getElementById('hero-stats').innerHTML = pills.map(p => `<span class="stat-pill">${esc(p)}</span>`).join('');

  // Top Picks Bento
  document.getElementById('bento-picks').innerHTML = (L.top_picks || []).map(it => {
    const hot = it.resonance_count >= 2 ? `<span class="badge badge-hot">🔥 ${it.resonance_count}源共振</span>` : '';
    const heat = it.heat_badge ? `<span class="badge badge-hot">★ ${esc(it.heat_badge)}</span>` : '';
    const note = it.adong_note ? `<div class="adong-note">💬 <b>阿东注：</b>${esc(it.adong_note)}</div>` : '';
    return `
      <article class="pick-card">
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div class="badges-row">
            <span class="badge badge-cat">${esc(it.category)}</span>
            ${hot}
            ${heat}
            <span class="badge-id">[${esc(it.id)}]</span>
          </div>
          <h3 class="card-title"><a href="${esc(it.primary_url)}" target="_blank" rel="noopener noreferrer" style="color:inherit;">${esc(it.headline)}</a></h3>
          <p class="card-summary">${esc(it.one_liner)}</p>
          ${note}
        </div>
        <div class="card-footer">
          <div class="source-links">${renderSourceLinks(it.sources)}</div>
        </div>
      </article>
    `;
  }).join('');

  // Insights
  const insights = L.insights || [];
  document.getElementById('sec-insights').style.display = insights.length ? '' : 'none';
  document.getElementById('insights-grid').innerHTML = insights.map((ins, idx) => {
    const evs = (ins.evidence_ids || []).map(eid =>
      `<button class="ev-pill" onclick="jumpToItem('${esc(eid)}')">[${esc(eid)}]</button>`
    ).join('');
    return `
      <article class="insight-card">
        <div class="insight-head">
          <span class="insight-num">判断 0${idx + 1}</span>
          <h3 class="insight-title">${esc(ins.title)}</h3>
        </div>
        <p class="insight-body">${esc(ins.body)}</p>
        ${evs ? `<div class="evidence-bar"><span style="font-size:11.5px;color:var(--text-muted);">事实锚点：</span>${evs}</div>` : ''}
      </article>
    `;
  }).join('');

  // Category Pills
  const counts = {};
  for (const it of L.items || []) counts[it.category] = (counts[it.category] || 0) + 1;
  const cats = L.categories || SITE_META.categories || [];
  const catButtons = [`<button class="pill-btn active" data-cat="all" onclick="setCat('all')">全部 (${(L.items || []).length})</button>`];
  for (const cat of cats) {
    if (counts[cat]) {
      catButtons.push(`<button class="pill-btn" data-cat="${esc(cat)}" onclick="setCat('${esc(cat)}')">${esc(cat)} (${counts[cat]})</button>`);
    }
  }
  document.getElementById('cat-pills').innerHTML = catButtons.join('');

  // Telemetry
  const tele = L.sources_telemetry || [];
  document.getElementById('telemetry-summary').textContent =
    `📡 底层多源健康度监控（共 ${tele.length} 个公开源 · 免登录直连 · 单源独立容错）`;
  document.getElementById('telemetry-grid').innerHTML = tele.map(t => {
    const cls = t.status === 'ok' ? 'dot-ok' : (t.status === 'error' ? 'dot-err' : 'dot-cache');
    const label = t.status === 'ok' ? `${t.article_count}篇` : (t.status === 'error' ? '异常' : `${t.article_count}篇(缓存)`);
    return `
      <div class="source-chip" title="${esc(t.note || t.fetched_at || '')}">
        <span><i class="dot ${cls}"></i>${esc(t.source_name)}</span>
        <span style="color:var(--text-muted);font-variant-numeric:tabular-nums;">${esc(label)}</span>
      </div>
    `;
  }).join('');

  renderLedger();
}

function syncPills() {
  document.querySelectorAll('#cat-pills .pill-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === activeCat);
  });
  document.querySelectorAll('#tier-pills .pill-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tier === activeTier);
  });
}

function setCat(cat) { activeCat = cat; syncPills(); renderLedger(); }
function setTier(tier) { activeTier = tier; syncPills(); renderLedger(); }

function matchTier(it, tier) {
  if (tier === 'all') return true;
  if (tier === 'resonance') return (it.resonance_count || 1) >= 2;
  if (tier === 'papers') return it.tier === 'papers' || it.tier === 'official';
  return it.tier === tier;
}

function jumpToItem(itemId) {
  if (activeCat !== 'all' || activeTier !== 'all' || document.getElementById('search-box').value) {
    activeCat = 'all';
    activeTier = 'all';
    document.getElementById('search-box').value = '';
    syncPills();
    renderLedger();
  }
  const target = document.getElementById('item-' + itemId);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('flash-highlight');
  setTimeout(() => target.classList.remove('flash-highlight'), 2200);
}

function renderLedger() {
  const L = currentLedger;
  if (!L) return;
  const q = (document.getElementById('search-box').value || '').trim().toLowerCase();
  const filtered = (L.items || []).filter(it => {
    if (activeCat !== 'all' && it.category !== activeCat) return false;
    if (!matchTier(it, activeTier)) return false;
    if (q) {
      const blob = `${it.headline} ${it.one_liner} ${it.adong_note || ''} ${it.primary_source} ${(it.focus_hits || []).join(' ')}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  document.getElementById('filter-count-label').textContent =
    `当前显示 ${filtered.length} / ${(L.items || []).length} 条`;

  if (!filtered.length) {
    document.getElementById('ledger-container').innerHTML =
      `<div style="padding:36px;text-align:center;color:var(--text-muted);background:var(--surface);border-radius:12px;border:1px solid var(--border);">没有匹配的条目，试试切换分类或清空搜索词。</div>`;
    return;
  }

  const grouped = {};
  for (const it of filtered) {
    (grouped[it.category] = grouped[it.category] || []).push(it);
  }

  const cats = L.categories || SITE_META.categories || Object.keys(grouped);
  const blocks = [];
  for (const cat of cats) {
    const list = grouped[cat];
    if (!list || !list.length) continue;
    const rowsHtml = list.map(it => {
      const hot = it.resonance_count >= 2 ? `<span class="badge badge-hot">🔥 ${it.resonance_count}源</span>` : '';
      const heat = it.heat_badge ? `<span class="badge badge-hot">★ ${esc(it.heat_badge)}</span>` : '';
      const hits = (it.focus_hits || []).slice(0, 3).map(h => `<span class="badge">🎯 ${esc(h)}</span>`).join('');
      const note = it.adong_note ? `<div class="adong-note" style="margin-top:7px;">💬 <b>阿东注：</b>${esc(it.adong_note)}</div>` : '';
      return `
        <article class="feed-item" id="item-${esc(it.id)}">
          <div class="feed-top">
            <div class="feed-headline">
              <span class="badge-id" style="margin-right:6px;">[${esc(it.id)}]</span>
              <a href="${esc(it.primary_url)}" target="_blank" rel="noopener noreferrer" style="color:inherit;">${esc(it.headline)}</a>
            </div>
            <div class="badges-row" style="flex-shrink:0;">${hot}${heat}${hits}</div>
          </div>
          <p class="feed-desc">${esc(it.one_liner)}</p>
          ${note}
          <div class="feed-meta">
            <div class="source-links">${renderSourceLinks(it.sources)}</div>
          </div>
        </article>
      `;
    }).join('');

    blocks.push(`
      <div class="cat-block">
        <div class="cat-header">
          <h3 class="cat-name">${esc(cat)}</h3>
          <span class="cat-count">${list.length} 条</span>
        </div>
        <div class="feed-list">${rowsHtml}</div>
      </div>
    `);
  }
  document.getElementById('ledger-container').innerHTML = blocks.join('');
}

function renderArchive() {
  const days = MANIFEST.days || [];
  document.getElementById('archive-stats').textContent =
    `累计更新 ${MANIFEST.total_days || days.length} 期 · 共归档 ${MANIFEST.total_items || 0} 条去重情报`;

  document.getElementById('archive-issues-grid').innerHTML = days.map(d => `
    <div class="issue-card" onclick="goDate('${esc(d.date)}')">
      <div class="issue-card-head">
        <span>${esc(d.date)} ${esc(d.weekday || '')}</span>
        <span class="badge badge-cat">${d.selected_count || 0} 条 · ${d.insight_count || 0} 条判断</span>
      </div>
      <p class="issue-card-take">${esc(d.daily_take || '')}</p>
    </div>
  `).join('');

  const q = (document.getElementById('archive-search').value || '').trim().toLowerCase();
  const resBox = document.getElementById('archive-search-results');
  const daysSec = document.getElementById('archive-days-sec');

  if (!q) {
    resBox.innerHTML = '';
    daysSec.style.display = '';
    return;
  }

  daysSec.style.display = 'none';
  const matches = (SEARCH_DB || []).filter(row => {
    const blob = `${row.title} ${row.summary} ${row.adong_note || ''} ${row.category} ${row.source} ${row.date}`.toLowerCase();
    return blob.includes(q);
  }).slice(0, 80);

  if (!matches.length) {
    resBox.innerHTML = `<div style="padding:36px;text-align:center;color:var(--text-muted);background:var(--surface);border-radius:12px;border:1px solid var(--border);">全库未找到包含“${esc(q)}”的记录。</div>`;
    return;
  }

  resBox.innerHTML = `
    <div style="margin-bottom:10px;font-size:13px;color:var(--text-muted);">共匹配到 ${matches.length} 条历史记录：</div>
    <div class="feed-list">
      ${matches.map(m => {
        const isInternal = String(m.url || '').startsWith('#/');
        const linkAttr = isInternal ? '' : 'target="_blank" rel="noopener noreferrer"';
        const note = m.adong_note ? `<div class="adong-note" style="margin-top:6px;">💬 <b>阿东注：</b>${esc(m.adong_note)}</div>` : '';
        return `
          <article class="feed-item">
            <div class="feed-top">
              <div class="feed-headline">
                <span class="badge badge-cat" style="margin-right:6px;">${esc(m.category)}</span>
                <a href="${esc(m.url)}" ${linkAttr} style="color:inherit;">${esc(m.title)}</a>
              </div>
              <div class="badges-row" style="flex-shrink:0;">
                <a class="badge" href="#/${esc(m.date)}">${esc(m.date)}</a>
                <span class="badge">${esc(m.source)}</span>
              </div>
            </div>
            <p class="feed-desc">${esc(m.summary)}</p>
            ${note}
          </article>
        `;
      }).join('')}
    </div>
  `;
}

async function onRouteChange() {
  const hash = location.hash || '';
  if (hash === '#/archive') {
    switchView('archive', true);
    return;
  }
  const m = /^#\/(\d{4}-\d{2}-\d{2})$/.exec(hash);
  const targetDate = m ? m[1] : (MANIFEST.latest_date || (MANIFEST.days[0] && MANIFEST.days[0].date));
  switchView('daily', true);
  if (targetDate) {
    await loadDay(targetDate);
  }
}

document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    const input = currentView === 'archive' ? document.getElementById('archive-search') : document.getElementById('search-box');
    if (input) input.focus();
  }
});

async function boot() {
  try {
    const saved = localStorage.getItem('adong_daily_theme');
    if (saved) setTheme(saved);
  } catch (e) {}

  const [meta, manifest] = await Promise.all([
    fetchJson('data/site_meta.json'),
    fetchJson('data/manifest.json')
  ]);
  SITE_META = meta;
  MANIFEST = manifest;

  document.getElementById('nav-brand').textContent = meta.brand_badge || 'ADONG AI DAILY';
  document.getElementById('repo-link').href = meta.repository_url || 'https://github.com/adongwanai/adong-ai-daily';
  document.getElementById('footer-author').textContent = meta.author_name || '阿东玩 AI';
  document.getElementById('footer-author').href = meta.author_url || 'https://adongwanai.github.io/';

  if (meta.author_intro) {
    document.getElementById('author-colophon').innerHTML = `<strong>👋 阿东：</strong>${esc(meta.author_intro)}`;
  }

  const ecoHtml = (meta.links || []).slice(0, 2).map(l =>
    `<a class="nav-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`
  ).join('');
  document.getElementById('ecosystem-links').innerHTML = ecoHtml;

  document.getElementById('footer-links').innerHTML = (meta.links || []).map(l =>
    `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`
  ).join('');

  document.getElementById('date-select').innerHTML = (manifest.days || []).map(d =>
    `<option value="${esc(d.date)}">${esc(d.date)} ${esc(d.weekday || '')}（${d.selected_count || 0}条）</option>`
  ).join('');

  window.addEventListener('hashchange', onRouteChange);
  await onRouteChange();
}

boot();
