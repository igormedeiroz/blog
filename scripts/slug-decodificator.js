
(function () {
  'use strict';

  var IDX_KEY  = 'pc_index_v2';
  var IDX_TTL  = 6 * 60 * 60 * 1000;   // 6 h
  var PAGE_SZ  = 500;                  // teto do feed do Blogger
  var MAX_REQ  = 40;                   // trava de seguranca: ate 20.000 posts
  var RESERVED = /^(p|search|feeds|b|view|sitemap\.xml|robots\.txt|favicon\.ico)$/i;

  var RE_POST  = /^\/\d{4}\/\d{2}\/([^\/]+)\.html$/;
  var RE_PAGE  = /^\/p\/([^\/]+)\.html$/;
  var RE_SHORT = /^\/([^\/.]+)\/?$/;

  var path = decodeURIComponent(location.pathname);
  var tail = location.search + location.hash;

  // ---------- indice ----------
  function readIndex() {
    try {
      var raw = localStorage.getItem(IDX_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (Date.now() - o.t < IDX_TTL) ? o.d : null;
    } catch (e) { return null; }
  }

  function toUrl(slug, v) {
    return v === 'p' ? '/p/' + slug + '.html'
                     : '/' + v.slice(0, 4) + '/' + v.slice(4) + '/' + slug + '.html';
  }

  // 'fields' reduz muito o tamanho da resposta; se o teu feed o ignorar,
  // podes remove-lo sem alterar o comportamento.
  function feedChunk(kind, start) {
    var u = '/feeds/' + kind + '?alt=json&max-results=' + PAGE_SZ +
            '&start-index=' + start + '&fields=feed/entry(link)';
    return fetch(u, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  function harvest(data, idx) {
    var e = data && data.feed && data.feed.entry;
    if (!e) return 0;
    for (var i = 0; i < e.length; i++) {
      var links = e[i].link || [], href = '';
      for (var j = 0; j < links.length; j++)
        if (links[j].rel === 'alternate') { href = links[j].href; break; }
      if (!href) continue;
      var p = href.replace(/^https?:\/\/[^\/]+/, '');
      var m = p.match(RE_POST);
      if (m) { idx[m[1]] = p.slice(1, 5) + p.slice(6, 8); continue; }
      m = p.match(RE_PAGE);
      if (m) { idx[m[1]] = 'p'; }
    }
    return e.length;
  }

  function crawl(kind, idx, start, req) {
    if (req >= MAX_REQ) return Promise.resolve();
    return feedChunk(kind, start).then(function (data) {
      var n = harvest(data, idx);
      if (n < PAGE_SZ) return;
      return crawl(kind, idx, start + PAGE_SZ, req + 1);
    }).catch(function () { /* fim do feed ou erro: para aqui */ });
  }

  var building = null;
  function buildIndex() {
    if (building) return building;
    var idx = {};
    building = Promise.all([
      crawl('posts/summary', idx, 1, 0),
      crawl('pages/default', idx, 1, 0)
    ]).then(function () {
      try { localStorage.setItem(IDX_KEY, JSON.stringify({ t: Date.now(), d: idx })); } catch (e) {}
      return idx;
    });
    return building;
  }

  function warm() {
    if (readIndex()) return;
    var go = function () { buildIndex(); };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 });
    else setTimeout(go, 1500);
  }

  // ---------- A. URL longa -> curta (sem rede) ----------
  var m = path.match(RE_POST) || path.match(RE_PAGE);
  if (m) {
    history.replaceState(null, '', '/' + m[1] + tail);
    warm();
    return;
  }

  // ---------- B. URL curta -> resolve ----------
  var s = path.match(RE_SHORT);
  if (!s || RESERVED.test(s[1])) { warm(); return; }
  var slug = s[1];

  if (sessionStorage.getItem('pc_resolving') === slug) return;  // anti-loop
  sessionStorage.setItem('pc_resolving', slug);
  var done = function (url) {
    sessionStorage.removeItem('pc_resolving');
    if (url) location.replace(url + tail);
  };

  var cache = readIndex();
  if (cache && cache[slug]) { done(toUrl(slug, cache[slug])); return; }

  // Sem cache: testa pagina e monta indice ao mesmo tempo.
  var pagePath = '/p/' + slug + '.html';
  var isPage = fetch(pagePath, { method: 'HEAD', credentials: 'same-origin' })
                 .then(function (r) { return r.ok; }).catch(function () { return false; });
  var idxReady = buildIndex();

  isPage.then(function (ok) {
    if (ok) { done(pagePath); return; }
    return idxReady.then(function (idx) {
      done(idx[slug] ? toUrl(slug, idx[slug]) : null);
    });
  }).catch(function () { sessionStorage.removeItem('pc_resolving'); });
})();
