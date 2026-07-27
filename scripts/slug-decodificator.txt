
//<![CDATA[
(function () {
  // === Config ===
  var FEED_ENDPOINT = '/feeds/posts/summary';   // mesmo domínio
  var MAX_RESULTS = 500;                         // pode aumentar até 500 se precisar

  // === Helpers ===
  function isLongPostPath(p){ return /^\/\d{4}\/\d{2}\/[^/]+\.html$/.test(p); }
  function extractSlugFromLong(p){ return p.slice(p.lastIndexOf('/')+1, p.lastIndexOf('.html')); }
  function isShortSlugPath(p){ return /^\/[^/]+$/.test(p) && p !== '/' && p !== '/p'; }
  function replaceUrl(u){ if (history.replaceState) history.replaceState(null, null, u); }

  function getCanonicalHref(){
    var l = document.querySelector('link[rel="canonical"]');
    return l && l.href ? l.href : '';
  }
  function canonicalMatchesSlug(slug){
    var href = getCanonicalHref();
    return href ? new RegExp('/' + slug + '\\.html($|\\?)').test(href) : false;
  }

  function findAltLink(entry){
    if(!entry || !entry.link) return '';
    for (var i=0;i<entry.link.length;i++){
      if (entry.link[i].rel === 'alternate') return entry.link[i].href;
    }
    return '';
  }
  function findPostUrlInFeedBySlug(slug, feedObj){
    var feed = feedObj && (feedObj.feed || feedObj);
    if(!feed || !feed.entry) return '';
    var entries = feed.entry;
    for (var i=0;i<entries.length;i++){
      var href = findAltLink(entries[i]);
      if(!href) continue;
      var s = href.slice(href.lastIndexOf('/')+1).replace(/\.html.*/,'');
      if (s.toLowerCase() === slug.toLowerCase()) return href;
    }
    return '';
  }

  function fetchJson(url){
    return fetch(url, {credentials:'same-origin', cache:'no-cache'})
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
  }
  function jsonp(url){
    return new Promise(function(resolve, reject){
      var cb = 'pc_cb_' + Date.now();
      window[cb] = function(data){ resolve(data); cleanup(); };
      function cleanup(){
        delete window[cb];
        if (s.parentNode) s.parentNode.removeChild(s);
        clearTimeout(t);
      }
      var s = document.createElement('script');
      s.src = url + (url.indexOf('?')>-1?'&':'?') + 'alt=json-in-script&callback=' + cb;
      s.onerror = function(){ cleanup(); reject(new Error('JSONP error')); };
      document.head.appendChild(s);
      var t = setTimeout(function(){ cleanup(); reject(new Error('JSONP timeout')); }, 8000);
    });
  }

  function resolveSlugToUrl(slug){
    var searchUrl = FEED_ENDPOINT + '?alt=json&q=' + encodeURIComponent(slug) + '&max-results=' + MAX_RESULTS;
    return fetchJson(searchUrl)
      .catch(function(){ return jsonp(FEED_ENDPOINT + '?q=' + encodeURIComponent(slug) + '&max-results=' + MAX_RESULTS); })
      .then(function(data){
        var url = findPostUrlInFeedBySlug(slug, data);
        if (url) return url;
        // fallback: tenta primeira página do feed
        var listUrl = FEED_ENDPOINT + '?alt=json&max-results=' + Math.max(MAX_RESULTS, 100);
        return fetchJson(listUrl).catch(function(){ return jsonp(listUrl); })
          .then(function(data2){
            var u = findPostUrlInFeedBySlug(slug, data2);
            return u || '';
          });
      });
  }

  function run(){
    var path = location.pathname;

    // A) URL longa de postagem → mostrar curta
    if (isLongPostPath(path)) {
      var slug = extractSlugFromLong(path);
      replaceUrl('/' + slug);
      sessionStorage.setItem('pc_active_slug', slug);
      return;
    }

    // B) URL curta (/slug) → resolver para a postagem real e manter curta
    if (isShortSlugPath(path)) {
      var slug = decodeURIComponent(path.slice(1));

      // Já estamos exibindo o conteúdo da postagem correta? então mantém como está.
      if (canonicalMatchesSlug(slug)) {
        sessionStorage.setItem('pc_active_slug', slug);
        return;
      }

      // Evita loop enquanto resolve
      if (sessionStorage.getItem('pc_resolving') === slug) return;
      sessionStorage.setItem('pc_resolving', slug);

      resolveSlugToUrl(slug).then(function(postUrl){
        sessionStorage.removeItem('pc_resolving');
        if (postUrl) {
          // carrega a URL real; quando abrir, o caso A troca de volta para /slug
          location.replace(postUrl);
        } else {
          console.warn('Slug não encontrado no feed: ' + slug);
          // opcional: redirecionar para busca
          // location.href = '/search?q=' + encodeURIComponent(slug);
        }
      }).catch(function(){
        sessionStorage.removeItem('pc_resolving');
        console.warn('Falha ao consultar o feed do Blogger para resolver o slug.');
      });
    }
  }

  run(); // executa o mais cedo possível
})();
//]]>
