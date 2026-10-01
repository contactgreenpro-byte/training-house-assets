// Round 59. Lets the walk page run UNCHANGED inside the Base44 app.
//
// Jake: "Why are the rules from everything that I worked so hard on in the original web-based deal not applying here
// automatically? We almost have the exact same workflow." Because the app had been given a rewritten engine instead of
// this one, and every rule had to be ported by hand, one complaint at a time. This file is the fix for that: the app now
// runs walk.js itself, and walk.js never learns that its files moved.
//
// walk.js asks for files by relative path: './placements.json', '../models/kitchen_sink.glb', './little/washer.glb',
// './house_floor1.glb'. In the app they live in Base44 file storage under hashed names. So everything is matched on the
// last path segment, the file name, which is unique across the house.
//
//   window.__ASSETS = { 'placements.json': 'https://...a94bc449e_placements.json', ... }
//
// is set before walk.js runs: by the app (it reads the HouseAsset list and hands it over), or by a test page.
//
// The cache buster walk.js adds ('?v=' + time) is dropped. It exists so a freshly rebuilt local file is not served stale;
// an uploaded file gets a new hashed URL every time it changes and is served immutable for a year, so here the buster
// would only force a full re-download of 250 MB on every visit.
(function () {
  function nameOf(url) {
    const clean = String(url).split('#')[0].split('?')[0];
    return decodeURIComponent(clean.slice(clean.lastIndexOf('/') + 1));
  }
  function isLocal(url) {
    return !/^[a-z]+:\/\//i.test(String(url)) && !/^(data|blob):/i.test(String(url));
  }
  function resolve(url) {
    if (!isLocal(url)) return { url: url, known: true };
    const hit = (window.__ASSETS || {})[nameOf(url)];
    return hit ? { url: hit, known: true } : { url: url, known: false };
  }
  window.__resolveAsset = resolve;
  window.__missingAssets = [];
  // Round 98: every load is also kept by name, in start order, with the bytes the loader has seen so far (files[i] = {name,
  // loaded, total, done, failed}). The loading screen draws the house from these: the file name says which stage (lot, walls,
  // roof, pipes, equipment) and loaded against total says how far along that stage is. total is 0 when the server does not
  // say (a gzipped response); the screen then takes the size from assets.json. walk.js's own progress hook (round 98,
  // window.__walkProgress) carries the stage and the counts; the bytes are copied into it from here, because this is the
  // only place in the app that sees the loader's onProgress for every file.
  window.__loads = { started: 0, done: 0, failed: 0, files: [] };

  // the JSON manifests
  const realFetch = window.fetch.bind(window);
  // the page's own bootstrap reads the map with this, before there is a map to resolve anything against
  window.__realFetch = realFetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && isLocal(url) && /\.json(\?|$)/i.test(url)) {
      const r = resolve(url);
      if (r.known) return realFetch(r.url, init);
      window.__missingAssets.push(nameOf(url));
      return Promise.resolve(new Response('null', { status: 404 }));
    }
    return realFetch(input, init);
  };

  // every model. walk.js tries a model in three folders in turn and takes the first that loads; they all share one file
  // name, so the first try either finds the upload or fails fast without touching the network.
  function patchLoader() {
    const L = window.THREE && window.THREE.GLTFLoader;
    if (!L || L.prototype.__shimmed) return !!L;
    const realLoad = L.prototype.load;
    L.prototype.load = function (url, onLoad, onProgress, onError) {
      const r = resolve(url);
      if (!r.known && isLocal(url)) {
        const n = nameOf(url);
        if (window.__missingAssets.indexOf(n) < 0) window.__missingAssets.push(n);
        const err = new Error('not uploaded: ' + n);
        if (onError) setTimeout(function () { onError(err); }, 0);
        return;
      }
      // counted, so the loading screen can say how far along the house is instead of spinning
      const n = window.__loads;
      n.started++;
      const rec = { name: nameOf(url), loaded: 0, total: 0, done: false, failed: false };
      n.files.push(rec);
      // round 98: the bytes, into this record and into walk.js's progress object when it names the same file
      const bytes = function (ev) {
        if (ev && typeof ev.loaded === 'number') { rec.loaded = ev.loaded; if (ev.lengthComputable && ev.total > rec.total) rec.total = ev.total; }
        const P = window.__walkProgress;
        if (P && P.file && rec.name.indexOf(P.file) === 0) { P.bytesDone = rec.loaded; if (rec.total) P.bytesTotal = rec.total; }
      };
      return realLoad.call(this, r.url,
        function (g) { rec.done = true; n.done++; if (onLoad) onLoad(g); },
        function (ev) { bytes(ev); if (onProgress) onProgress(ev); },
        function (e) { rec.failed = true; n.failed++; if (onError) onError(e); });
    };
    L.prototype.__shimmed = true;
    return true;
  }
  window.__patchWalkLoader = patchLoader;
  patchLoader();
})();
