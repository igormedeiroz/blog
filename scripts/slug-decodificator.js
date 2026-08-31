(function () {
  'use strict';

  /*
   * Blogger Short Slug Resolver
   *
   * /slug
   *   ↓
   * índice local
   *   ↓
   * /2026/08/slug.html
   * ou
   * /p/slug.html
   *
   * Também converte:
   * /2026/08/slug.html → /slug
   * /p/slug.html        → /slug
   */

  var IDX_KEY = 'pc_index_v3';
  var IDX_TTL = 6 * 60 * 60 * 1000; // 6 horas

  var PAGE_SIZE = 500;
  var MAX_REQUESTS = 40;

  var RESERVED = /^(p|search|feeds|b|view|sitemap\.xml|robots\.txt|favicon\.ico)$/i;

  var RE_POST = /^\/\d{4}\/\d{2}\/([^\/]+)\.html$/i;
  var RE_PAGE = /^\/p\/([^\/]+)\.html$/i;
  var RE_SHORT = /^\/([^\/.]+)\/?$/;

  var path;

  /*
   * decodeURIComponent pode lançar exceção
   * caso exista uma URL malformada.
   */
  try {
    path = decodeURIComponent(location.pathname);
  } catch (e) {
    path = location.pathname;
  }

  var tail = location.search + location.hash;

  /*
   * ----------------------------------------------------
   * CACHE / ÍNDICE
   * ----------------------------------------------------
   */

  function readIndex() {
    try {
      var raw = localStorage.getItem(IDX_KEY);

      if (!raw) {
        return null;
      }

      var obj = JSON.parse(raw);

      if (!obj || !obj.t || !obj.d) {
        return null;
      }

      if (Date.now() - obj.t >= IDX_TTL) {
        localStorage.removeItem(IDX_KEY);
        return null;
      }

      return obj.d;

    } catch (e) {
      return null;
    }
  }

  function saveIndex(index) {
    try {
      localStorage.setItem(
        IDX_KEY,
        JSON.stringify({
          t: Date.now(),
          d: index
        })
      );
    } catch (e) {
      /*
       * localStorage pode estar bloqueado,
       * cheio ou indisponível.
       */
    }
  }

  /*
   * ----------------------------------------------------
   * FEED DO BLOGGER
   * ----------------------------------------------------
   */

  function fetchFeed(kind, start) {

    var url =
      '/feeds/' +
      kind +
      '?alt=json' +
      '&max-results=' + PAGE_SIZE +
      '&start-index=' + start;

    return fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    })
    .then(function (response) {

      if (!response.ok) {
        throw new Error(
          'Blogger feed HTTP ' + response.status
        );
      }

      return response.json();
    });
  }

  /*
   * ----------------------------------------------------
   * EXTRAI SLUGS DO FEED
   * ----------------------------------------------------
   */

  function harvest(data, index) {

    var entries =
      data &&
      data.feed &&
      data.feed.entry;

    if (!Array.isArray(entries)) {
      return 0;
    }

    for (var i = 0; i < entries.length; i++) {

      var links = entries[i].link || [];
      var href = '';

      for (var j = 0; j < links.length; j++) {

        if (links[j].rel === 'alternate') {
          href = links[j].href;
          break;
        }
      }

      if (!href) {
        continue;
      }

      var pathname;

      try {
        pathname = new URL(
          href,
          location.origin
        ).pathname;
      } catch (e) {
        continue;
      }

      /*
       * POST
       *
       * /2026/08/meu-post.html
       */
      var match = pathname.match(RE_POST);

      if (match) {
        index[match[1]] = pathname;
        continue;
      }

      /*
       * PAGE
       *
       * /p/minha-pagina.html
       */
      match = pathname.match(RE_PAGE);

      if (match) {
        index[match[1]] = pathname;
      }
    }

    return entries.length;
  }

  /*
   * ----------------------------------------------------
   * CRAWLER
   * ----------------------------------------------------
   */

  function crawl(kind, index, start, requestNumber) {

    if (requestNumber >= MAX_REQUESTS) {
      return Promise.resolve();
    }

    return fetchFeed(kind, start)
      .then(function (data) {

        var count = harvest(data, index);

        /*
         * Feed vazio ou menor que PAGE_SIZE:
         * provavelmente chegamos ao final.
         */
        if (!count || count < PAGE_SIZE) {
          return;
        }

        return crawl(
          kind,
          index,
          start + PAGE_SIZE,
          requestNumber + 1
        );
      });
  }

  /*
   * Evita duas construções simultâneas
   * do mesmo índice.
   */
  var building = null;

  function buildIndex() {

    if (building) {
      return building;
    }

    var index = {};

    building = Promise.all([

      /*
       * Posts
       */
      crawl(
        'posts/summary',
        index,
        1,
        0
      ),

      /*
       * Páginas
       */
      crawl(
        'pages/default',
        index,
        1,
        0
      )

    ])
    .then(function () {

      saveIndex(index);

      return index;

    })
    .catch(function (error) {

      /*
       * Não engole silenciosamente o erro.
       * Fica disponível no console para diagnóstico.
       */
      console.error(
        '[SlugResolver] Erro ao construir índice:',
        error
      );

      throw error;

    })
    .finally(function () {
      building = null;
    });

    return building;
  }

  /*
   * ----------------------------------------------------
   * PRÉ-CARREGAMENTO DO ÍNDICE
   * ----------------------------------------------------
   */

  function warmIndex() {

    if (readIndex()) {
      return;
    }

    var run = function () {

      buildIndex()
        .catch(function () {
          /*
           * Falha no warm-up não deve quebrar a página.
           */
        });

    };

    if (typeof window.requestIdleCallback === 'function') {

      window.requestIdleCallback(
        run,
        {
          timeout: 4000
        }
      );

    } else {

      setTimeout(
        run,
        1500
      );
    }
  }

  /*
   * ----------------------------------------------------
   * A. URL ORIGINAL → URL CURTA
   * ----------------------------------------------------
   *
   * /2026/08/meu-post.html
   *             ↓
   * /meu-post
   *
   * /p/minha-pagina.html
   *             ↓
   * /minha-pagina
   */

  var originalMatch =
    path.match(RE_POST) ||
    path.match(RE_PAGE);

  if (originalMatch) {

    var originalSlug = originalMatch[1];

    history.replaceState(
      null,
      '',
      '/' + originalSlug + tail
    );

    /*
     * Aproveita o carregamento da página
     * para aquecer o índice.
     */
    warmIndex();

    return;
  }

  /*
   * ----------------------------------------------------
   * B. URL CURTA → RESOLUÇÃO
   * ----------------------------------------------------
   */

  var shortMatch = path.match(RE_SHORT);

  /*
   * Não é um slug simples.
   */
  if (!shortMatch) {
    warmIndex();
    return;
  }

  var slug = shortMatch[1];

  /*
   * URLs reservadas do Blogger.
   */
  if (RESERVED.test(slug)) {
    warmIndex();
    return;
  }

  /*
   * ----------------------------------------------------
   * CACHE
   * ----------------------------------------------------
   */

  var cachedIndex = readIndex();

  if (cachedIndex && cachedIndex[slug]) {

    location.replace(
      cachedIndex[slug] + tail
    );

    return;
  }

  /*
   * ----------------------------------------------------
   * SEM CACHE
   * ----------------------------------------------------
   *
   * Constrói o índice e procura o slug.
   *
   * Não usamos HEAD.
   */

  buildIndex()
    .then(function (index) {

      if (
        index &&
        index[slug]
      ) {

        location.replace(
          index[slug] + tail
        );

        return;
      }

      /*
       * Slug não encontrado.
       *
       * Não fazemos redirect falso.
       * O Blogger continua tratando a URL normalmente.
       */
    })
    .catch(function (error) {

      console.error(
        '[SlugResolver] Falha ao resolver slug "' +
        slug +
        '":',
        error
      );

    });

})();