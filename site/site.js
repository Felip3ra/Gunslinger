(function () {
  var c = window.GUNSLINGER_CONFIG || {};
  var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  all('[data-download]').forEach(function (a) {
    if (c.installerUrl) { a.href = c.installerUrl; a.setAttribute('rel', 'noopener'); }
  });
  all('[data-releases]').forEach(function (a) { if (c.releasesPage) a.href = c.releasesPage; });
  var setText = function (sel, text) { all(sel).forEach(function (el) { el.textContent = text; }); };
  if (c.version) setText('[data-version]', c.version);
  if (c.sizeLabel) setText('[data-size]', c.sizeLabel);

  // Versão e tamanho da última release do GitHub; os valores do config.js ficam como reserva.
  if (c.releasesApi && window.fetch) {
    fetch(c.releasesApi, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (release) {
        if (!release || !release.tag_name) return;
        setText('[data-version]', release.tag_name.replace(/^v/, ''));
        var assets = {};
        (release.assets || []).forEach(function (a) { assets[a.name] = a; });
        var megabytes = function (asset) { return Math.round(asset.size / 1000000) + ' MB'; };
        if (assets['Gunslinger-Setup.exe']) setText('[data-size]', megabytes(assets['Gunslinger-Setup.exe']));

        // Linux e macOS: cada botão aponta para um arquivo da release e só aparece se ele existir.
        var available = {};
        all('[data-asset]').forEach(function (link) {
          var asset = assets[link.getAttribute('data-asset')];
          if (!asset) { link.hidden = true; return; }
          link.href = asset.browser_download_url;
          link.setAttribute('rel', 'noopener');
          var size = link.querySelector('[data-asset-size]');
          if (size) size.textContent = megabytes(asset);
          var block = link.closest('[data-platform]');
          if (block) { block.hidden = false; available[block.getAttribute('data-platform')] = true; }
        });
        if (!available.linux && !available.mac) return;
        all('[data-multi]').forEach(function (el) { el.hidden = false; });
        all('[data-winonly]').forEach(function (el) { el.hidden = true; });

        // Botão do topo: em Linux e macOS leva à seção de download (há mais de um arquivo por sistema).
        var ua = navigator.userAgent || '';
        var os = /Mac OS X|Macintosh/.test(ua) ? 'mac' : /Linux|X11/.test(ua) && !/Android/.test(ua) ? 'linux' : 'windows';
        if (os !== 'windows' && available[os]) {
          all('[data-hero-download]').forEach(function (a) { a.href = '#download'; a.removeAttribute('rel'); });
          setText('[data-hero-label]', os === 'mac' ? 'Baixar para macOS' : 'Baixar para Linux');
        }
      })
      .catch(function () {});
  }

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Galeria da seção Interface.
  all('[data-gallery]').forEach(function (gallery) {
    var tabs = Array.prototype.slice.call(gallery.querySelectorAll('[role="tab"]'));
    var img = gallery.querySelector('img');
    var caption = gallery.querySelector('figcaption');
    var select = function (tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      img.src = tab.dataset.src;
      img.alt = tab.dataset.alt;
      caption.textContent = tab.dataset.caption;
      if (focus) tab.focus();
    };
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab, false); });
      tab.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
      });
    });
  });

  // Sumário do manual: marca a seção visível.
  var tocLinks = all('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        tocLinks.forEach(function (a) { a.classList.remove('on'); });
        var link = byId[e.target.id];
        if (link) link.classList.add('on');
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    all('.doc h2[id]').forEach(function (h) { spy.observe(h); });
  }

  var items = all('.reveal');
  if (!('IntersectionObserver' in window)) { items.forEach(function (el) { el.classList.add('in'); }); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  items.forEach(function (el) { io.observe(el); });
})();
