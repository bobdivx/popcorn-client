/* Popcornn Native — mesure de fluidité (activée seulement si lancée avec {"perf":1}).
   FPS (rAF), long tasks, heap JS, latence touche→focus→frame, événements YouTube.
   Envoie un rapport au service local (POST /__perf), lisible via GET /__perf. ES5. */
(function () {
  try {
    if (/[?&]__perf=1/.test(location.search)) sessionStorage.setItem('__perf', '1');
    if (sessionStorage.getItem('__perf') !== '1') return;
  } catch (e) { return; }
  var now = function () { return performance.now(); };
  var S = { ua: navigator.userAgent, path: location.pathname, startedAt: Date.now(), longTasks: 0, longTaskMs: 0, yt: [], keys: [], errors: [] };
  function post(kind, data) {
    try {
      var x = new XMLHttpRequest();
      x.open('POST', '/__perf', true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.send(JSON.stringify({ kind: kind, path: location.pathname, t: Date.now(), data: data }));
    } catch (e) {}
  }
  window.addEventListener('error', function (e) { S.errors.push(String(e.message).slice(0, 200)); });
  try {
    new PerformanceObserver(function (l) { l.getEntries().forEach(function (en) { S.longTasks++; S.longTaskMs += en.duration; }); }).observe({ entryTypes: ['longtask'] });
  } catch (e) {}
  window.addEventListener('message', function (e) {
    if (!/youtube/.test(e.origin || '')) return;
    var d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (x) { return; }
    if (!d || !d.event) return;
    if (d.event === 'onError' || d.event === 'onStateChange' || d.event === 'onReady' || d.event === 'initialDelivery' ||
        (d.event === 'infoDelivery' && d.info && (d.info.playerState != null || d.info.muted != null))) {
      if (S.yt.length < 60) S.yt.push({ t: Math.round(now()), ev: d.event, info: d.info && typeof d.info === 'object' ? { ps: d.info.playerState, muted: d.info.muted, vol: d.info.volume } : d.info });
    }
  });
  // FPS
  var frames = 0, gaps50 = 0, gaps100 = 0, last = 0, fpsWin = [], winStart = now(), winFrames = 0;
  function raf(ts) {
    if (last) { var g = ts - last; if (g > 50) gaps50++; if (g > 100) gaps100++; }
    last = ts; frames++; winFrames++;
    if (ts - winStart >= 1000) { fpsWin.push(Math.round(winFrames * 1000 / (ts - winStart))); winFrames = 0; winStart = ts; }
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
  function mem() { var m = performance.memory; return m ? { usedMB: Math.round(m.usedJSHeapSize / 1048576), totalMB: Math.round(m.totalJSHeapSize / 1048576) } : null; }
  var CODES = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
  function press(key, done) {
    var target = document.activeElement || document.body;
    var t0 = now(), tFocus = null;
    var onF = function () { if (tFocus == null) tFocus = now(); };
    document.addEventListener('focusin', onF, true);
    var ev = new KeyboardEvent('keydown', { key: key, code: key, bubbles: true, cancelable: true });
    try { Object.defineProperty(ev, 'keyCode', { get: function () { return CODES[key]; } }); Object.defineProperty(ev, 'which', { get: function () { return CODES[key]; } }); } catch (e) {}
    target.dispatchEvent(ev);
    var tSync = now();
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      document.removeEventListener('focusin', onF, true);
      var a = document.activeElement;
      S.keys.push({ k: key, handlerMs: +(tSync - t0).toFixed(1), focusMs: tFocus == null ? null : +(tFocus - t0).toFixed(1), frameMs: +(now() - t0).toFixed(1),
        to: a ? (a.getAttribute('aria-label') || a.textContent || a.tagName).slice(0, 30) : null });
      done();
    }); });
  }
  function run(seq, gap, cb) {
    var i = 0;
    (function next() { if (i >= seq.length) return cb(); press(seq[i++], function () { setTimeout(next, gap); }); })();
  }
  function stats(arr) {
    var v = arr.filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var p = function (q) { return v[Math.min(v.length - 1, Math.floor(q * v.length))]; };
    return { n: v.length, p50: p(0.5), p90: p(0.9), max: v[v.length - 1], avg: +(v.reduce(function (a, b) { return a + b; }, 0) / v.length).toFixed(1) };
  }
  function snapshot(label) {
    return { label: label, fpsWindows: fpsWin.slice(), fpsMin: fpsWin.length ? Math.min.apply(null, fpsWin) : null,
      fpsAvg: fpsWin.length ? Math.round(fpsWin.reduce(function (a, b) { return a + b; }, 0) / fpsWin.length) : null,
      gaps50: gaps50, gaps100: gaps100, longTasks: S.longTasks, longTaskMs: Math.round(S.longTaskMs), mem: mem() };
  }
  function reset() { fpsWin = []; gaps50 = 0; gaps100 = 0; S.longTasks = 0; S.longTaskMs = 0; winStart = now(); winFrames = 0; }
  function bench() {
    if (!/dashboard/.test(location.pathname)) return;
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var load = { domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null, load: nav ? Math.round(nav.loadEventEnd) : null,
      imgs: document.images.length, nodes: document.getElementsByTagName('*').length, fcp: null };
    try { performance.getEntriesByType('paint').forEach(function (p) { if (p.name === 'first-contentful-paint') load.fcp = Math.round(p.startTime); }); } catch (e) {}
    var idle = snapshot('idle');
    reset(); S.keys = [];
    var D = 'ArrowDown', R = 'ArrowRight', L = 'ArrowLeft', U = 'ArrowUp';
    var seq = [D, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, L, L, L, D, R, R, R, R, U, U, U, U, U];
    run(seq, 280, function () {
      var nav1 = snapshot('navigation');
      var keys = S.keys.slice();
      reset();
      // Hero : focus sur Regarder pendant 6 s (lecture bande-annonce différée attendue)
      setTimeout(function () {
        post('report', { load: load, idle: idle, nav: nav1,
          handlerMs: stats(keys.map(function (k) { return k.handlerMs; })), frameMs: stats(keys.map(function (k) { return k.frameMs; })),
          keys: keys, heroIdle: snapshot('hero-6s'), yt: S.yt, errors: S.errors, ua: S.ua, viewport: innerWidth + 'x' + innerHeight, dpr: devicePixelRatio,
          active: document.activeElement ? (document.activeElement.textContent || '').slice(0, 40) : null });
      }, 6000);
    });
  }
  var ran = false;
  function arm() { if (ran || !/dashboard/.test(location.pathname)) return; ran = true; setTimeout(bench, 9000); }
  window.addEventListener('load', arm);
  document.addEventListener('astro:page-load', arm);
  setInterval(arm, 2000);
  window.__popcornnPerfBench = bench;
})();
