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
        var setup = (release.assets || []).filter(function (a) { return a.name === 'Gunslinger-Setup.exe'; })[0];
        if (setup) setText('[data-size]', Math.round(setup.size / 1000000) + ' MB');
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
