/* REALMSHARD service worker — emitted as dist/sw.js by vite.config.ts (web build only).
 *
 * Deliberately minimal, so it can never pin players on an old build:
 *  - navigations to index.html: NETWORK FIRST (see navigate()). Online,
 *    the page always comes from the network exactly as without a SW; the
 *    cached copy is only a fallback when the network is down.
 *  - /assets/* (content-hashed by Vite) and art / atlas / audio URLs carrying
 *    ?v=<their version>: CACHE FIRST (a new deploy changes those URLs anyway).
 *  - music (audio/music/*?v=<music version>): kept whole once played (at most
 *    MUSIC_CACHE_MAX tracks, least recently played dropped first) and every
 *    byte range of the <audio> element answered from that copy (music(),
 *    helpers inlined from tools/app/swRange.mjs). Not cached yet: never a
 *    wait for the whole file; storage broken: the network, as without a SW.
 *  - anything else (Supabase, fonts CDN, other origins, POST…): untouched.
 *  - install(): precaches this build's JS / CSS chunks (PRECACHE), lazy
 *    modes included (src/scenes/lazy.ts); the EN / DE language packs are
 *    left out (vite.config.ts): fetched on demand, cache-first, by who uses them.
 * Each build has its own cache name; activate() deletes every other one
 * (the art cache is keyed by the art version, so it survives code-only deploys;
 * music and sounds have one version each, so a new track keeps the sounds cached).
 */
const BUILD = '20261031T1729-e3ff79';
const ART = '5dc7cf463d';
const AUDIO = '833d472675';
const MUSIC = 'd3530f44b3';
const SHELL_CACHE = `realmshard-shell-${BUILD}`;
const ART_CACHE = `realmshard-art-${ART}`;
const AUDIO_CACHE = `realmshard-audio-${AUDIO}`;
const MUSIC_CACHE = `realmshard-music-${MUSIC}`;
const KEEP = [SHELL_CACHE, ART_CACHE, AUDIO_CACHE, MUSIC_CACHE];

/** This build's JS / CSS chunks (boot + lazy modes, not the EN / DE packs), from vite.config.ts. */
const PRECACHE = ["assets/Duel-CnXEYfA_.js","assets/activity-D_yTCdao.js","assets/bundler-fXp8XetU.js","assets/cardGrid-Ch7zoffJ.js","assets/cine-D371D8iu.js","assets/clientErrors-DDGRGA91.js","assets/collection-CIkKchWz.js","assets/content-BIQkGI4Q.js","assets/corruptSaveNotice-CKKLaTxu.js","assets/duel-o14laoUu.js","assets/duelFx-Bkr54dXT.js","assets/index-D2ETncZD.css","assets/index-DZNoncCo.js","assets/index-e6yEDVEA.js","assets/interrupted-DkvnBBdd.js","assets/matchRecap-CGfJE4At.js","assets/pixi-DPeEOpoI.js","assets/premiumSync-K3EjbcU0.js","assets/rankedPay-CX9o4Chh.js","assets/rankedServer-tCxiuKDB.js","assets/realmRankView-AO6q9SjH.js","assets/rvr-CxEH6iHM.js","assets/story-DjSHX_f0.js","assets/vendor-C8r_Nbax.js"];

/* REALMSHARD service worker — byte ranges of the music (audit SON-08).
 *
 * An <audio> element always asks for byte ranges (`Range: bytes=0-`, Safari
 * first probes `bytes=0-1`), so a track never reached the cache. The service
 * worker now fetches the whole file once (no Range header), keeps it in the
 * music cache and answers every range from that complete copy with a 206.
 * Until then, nothing waits for a whole file: a small probe or a range asked
 * during that first download goes to the network as before.
 *
 * Pure helpers only (no `self`, no `caches`): vite.config.ts inlines this
 * file into dist/sw.js (the `export` keywords are dropped there, so no
 * import / export may be added), and tests/swRange.test.ts runs it in Node.
 */

/** Music tracks kept at most in the music cache (the least recently played go first). */
const MUSIC_CACHE_MAX = 12;

/** Largest explicit range of a track not cached yet asked straight from the network (Safari's `bytes=0-1` probe). */
const SMALL_RANGE_MAX = 64 * 1024;

/**
 * Inclusive byte span asked by a `Range` header, inside a body of `size` bytes.
 *  - null: no header, another unit, several ranges or an invalid one (RFC 9110:
 *    the header is then ignored) → answer the whole body with a 200;
 *  - 'unsatisfiable': a valid range starting past the end → 416.
 */
function parseRange(header, size) {
  if (typeof header !== 'string') return null;
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    // Suffix range: the last N bytes.
    const n = Number(m[2]);
    if (n === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  if (m[2] !== '' && Number(m[2]) < start) return null;
  if (start >= size) return 'unsatisfiable';
  return { start, end: m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1) };
}

/**
 * No Range header, or a range covering the whole `size`-byte body from its
 * first byte (`bytes=0-`, Safari's `bytes=0-<size-1>` after its probe): a
 * fresh download of the file can be streamed to the player as is.
 */
function wholeFromStart(header, size) {
  if (typeof header !== 'string') return true;
  const span = parseRange(header, size);
  return span !== null && span !== 'unsatisfiable' && span.start === 0 && span.end === size - 1;
}

/** An explicit `bytes=a-b` range of at most `max` bytes: cheaper to ask the network than to download the whole track first. */
function smallRange(header, max = SMALL_RANGE_MAX) {
  if (typeof header !== 'string') return false;
  const m = /^\s*bytes\s*=\s*(\d+)\s*-\s*(\d+)\s*$/i.exec(header);
  return !!m && Number(m[2]) >= Number(m[1]) && Number(m[2]) - Number(m[1]) < max;
}

/** Headers of the 206 answer carrying `span` of a `size`-byte body. */
function rangeHeaders(span, size, type) {
  return {
    'Content-Type': type || 'application/octet-stream',
    'Content-Range': `bytes ${span.start}-${span.end}/${size}`,
    'Content-Length': String(span.end - span.start + 1),
    'Accept-Ranges': 'bytes',
  };
}

/**
 * Answer `rangeHeader` from `full`, a complete (200) response: the asked
 * slice as a 206, the whole body as a 200 when there is no usable range, or
 * a 416 for a range past the end.
 */
async function rangeResponse(full, rangeHeader) {
  const blob = await full.blob();
  const size = blob.size;
  const type = full.headers.get('Content-Type') || blob.type;
  const span = parseRange(rangeHeader, size);
  if (span === 'unsatisfiable') {
    return new Response(null, { status: 416, statusText: 'Range Not Satisfiable', headers: { 'Content-Range': `bytes */${size}` } });
  }
  if (!span) {
    return new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
  }
  return new Response(blob.slice(span.start, span.end + 1), { status: 206, statusText: 'Partial Content', headers: rangeHeaders(span, size, type) });
}

/**
 * Size of a network response whose body can be streamed to the player as a
 * 206 `bytes 0-(size-1)/size` while it is cached: a plain 200 with a
 * Content-Length and no content encoding (a gzip body would not match the
 * announced length). 0: it can't (the network answers the range meanwhile).
 */
function streamableSize(res) {
  if (!res || res.status !== 200 || !res.body) return 0;
  const enc = res.headers.get('Content-Encoding');
  if (enc && enc.toLowerCase() !== 'identity') return 0;
  const size = Number(res.headers.get('Content-Length'));
  return Number.isInteger(size) && size > 0 ? size : 0;
}

/**
 * Most-recently-played order once `key` is played: `key` moves to the end and
 * the oldest entries beyond `max` come back in `evict` (to delete from the cache).
 */
function lruTouch(order, key, max = MUSIC_CACHE_MAX) {
  const next = order.filter((k) => k !== key);
  next.push(key);
  const evict = next.length > max ? next.splice(0, next.length - max) : [];
  return { order: next, evict };
}

/**
 * Order of the cached tracks: the saved list first (only the tracks still in
 * the cache), then any cached track the list missed, in cache order.
 */
function lruRestore(saved, cachedKeys) {
  const list = Array.isArray(saved) ? saved.filter((k) => typeof k === 'string' && cachedKeys.includes(k)) : [];
  return list.concat(cachedKeys.filter((k) => !list.includes(k)));
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Precache the chunks of this build: modes open offline, and a lazy chunk
  // is never fetched from a newer deploy. Best effort: one failed file never
  // blocks the install (it is fetched again on demand, cache-first below).
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => Promise.all(PRECACHE.map((f) => c.add(new URL(f, self.registration.scope).href).catch(() => undefined))))
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('realmshard-') && !KEEP.includes(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

const scope = new URL(self.registration.scope);

function cacheable(res) {
  return res && res.status === 200 && res.type === 'basic';
}

/**
 * Navigations (the installed app's start_url included). Never answers with a
 * redirected or opaque-redirect copy from the cache (Chrome rejects a
 * redirected response for a navigation: « a redirected response was used
 * for a request whose redirect mode is not follow » = blank app), never
 * caches one, and a cached copy is rebuilt as a plain 200 Response.
 * Network errors other than offline (5xx, 404) are passed through untouched.
 */
function plain(res) {
  if (!res || !res.redirected) return res;
  return res.blob().then((body) => new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }));
}

async function navigate(req) {
  try {
    const res = await fetch(req);
    if (cacheable(res) && !res.redirected) {
      const copy = res.clone();
      void caches.open(SHELL_CACHE).then((c) => c.put(scope.href, copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    // Offline: the last index.html seen (one copy, keyed by the scope URL).
    const hit = await caches.match(scope.href);
    if (hit && hit.type !== 'opaqueredirect') return plain(hit);
    throw err;
  }
}

async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) {
    const copy = res.clone();
    void caches.open(name).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

/*
 * Music. The cache holds whole tracks (200) under their URL, plus the
 * most-recently-played order under MUSIC_LRU (it survives the worker being
 * stopped between two scenes). LRU updates run one after the other.
 */
const MUSIC_LRU = new URL('__music-lru', scope).href;
/** Tracks being downloaded whole right now (url). */
const musicFetches = new Set();
let musicOrder = null;
let musicQueue = Promise.resolve();

function touchMusic(cache, url) {
  musicQueue = musicQueue
    .then(async () => {
      if (!musicOrder) {
        const saved = await cache.match(MUSIC_LRU);
        const keys = (await cache.keys()).map((r) => r.url).filter((u) => u !== MUSIC_LRU);
        musicOrder = lruRestore(saved ? await saved.json().catch(() => null) : null, keys);
      }
      const { order, evict } = lruTouch(musicOrder, url);
      musicOrder = order;
      for (const u of evict) await cache.delete(u);
      await cache.put(MUSIC_LRU, new Response(JSON.stringify(order), { headers: { 'Content-Type': 'application/json' } }));
    })
    .catch(() => {});
  return musicQueue;
}

async function music(event, req, url) {
  const key = url.href;
  const range = req.headers.get('range');
  const cache = await caches.open(MUSIC_CACHE);
  const hit = await cache.match(key);
  if (hit) {
    event.waitUntil(touchMusic(cache, key));
    return rangeResponse(hit, range);
  }
  // Not cached yet. Safari's `bytes=0-1` probe, or any range asked while this
  // track is already being downloaded: the network answers, as before (no wait
  // for a whole file). No await between this check and the add() below, so
  // one download per track.
  if (musicFetches.has(key) || smallRange(range)) return fetch(req);
  // First play: the whole file once, without a Range header.
  musicFetches.add(key);
  let res;
  try {
    res = await fetch(key, { credentials: 'same-origin' });
  } catch {
    musicFetches.delete(key);
    return fetch(req);
  }
  if (!cacheable(res)) {
    musicFetches.delete(key);
    return res;
  }
  const store = (body) =>
    cache
      .put(key, new Response(body, { status: 200, headers: res.headers }))
      .then(() => touchMusic(cache, key))
      .catch(() => undefined) // quota / storage error: played from the network next time too
      .finally(() => musicFetches.delete(key));
  const size = streamableSize(res);
  if (size && wholeFromStart(range, size)) {
    // `bytes=0-` (or no range): stream it to the player while it is cached.
    const [toCache, toPlayer] = res.body.tee();
    event.waitUntil(store(toCache));
    const headers = range ? rangeHeaders({ start: 0, end: size - 1 }, size, res.headers.get('Content-Type')) : res.headers;
    return new Response(toPlayer, { status: range ? 206 : 200, headers });
  }
  // Another range first (a seek): the slice from the network, the whole file cached meanwhile.
  event.waitUntil(store(res.body));
  return fetch(req);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const rel = url.pathname.slice(scope.pathname.length);
  // Music: whole tracks cached, byte ranges answered from them (SON-08). Cache
  // Storage broken (corrupt, evicted, quota): the network, as without a SW.
  if (rel.startsWith('audio/music/') && url.searchParams.get('v') === MUSIC) {
    event.respondWith(music(event, req, url).catch(() => fetch(req)));
    return;
  }
  // Other range requests and the update probes go straight to the network.
  if (req.headers.has('range')) return;
  if (rel === 'version.json' || rel === 'sw.js') return;
  if (req.mode === 'navigate') {
    // Only the app's own page (index.html, any ?query): other paths under the
    // scope are left to the browser.
    if (rel !== '' && rel !== 'index.html') return;
    event.respondWith(navigate(req));
    return;
  }
  if (rel.startsWith('assets/')) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }
  if (/^(art|atlas)\//.test(rel) && url.searchParams.get('v') === ART) {
    event.respondWith(cacheFirst(req, ART_CACHE));
    return;
  }
  // Sounds and voices have their own version (and cache): an art edit or a new
  // music track keeps them cached.
  if (rel.startsWith('audio/') && url.searchParams.get('v') === AUDIO) {
    event.respondWith(cacheFirst(req, AUDIO_CACHE));
  }
});

/*
 * Web Push (docs/NOTIFICATIONS.md): the `push-daily` Edge Function sends
 * { title, body, target, tag } at most once a day. These two listeners never
 * touch fetch / caching: they only show the notification and handle its tap.
 */
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : '' };
  }
  const title = typeof d.title === 'string' && d.title ? d.title : 'REALMSHARD';
  const target = d.target === 'boosters' ? 'boosters' : 'menu';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof d.body === 'string' ? d.body : '',
      icon: new URL('icons/icon-192.png', scope).href,
      badge: new URL('icons/favicon-64.png', scope).href,
      // One slot: a newer message replaces the previous one instead of piling up.
      tag: typeof d.tag === 'string' ? d.tag : 'realmshard-daily',
      renotify: false,
      data: { target },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.target === 'boosters' ? 'boosters' : 'menu';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // A game tab already open: focus it and tell it where to go (no reload, no navigation).
      for (const w of wins) {
        const u = new URL(w.url);
        if (u.origin === scope.origin && u.pathname.startsWith(scope.pathname) && 'focus' in w) {
          w.postMessage({ type: 'rs-notif', target });
          return w.focus();
        }
      }
      // Else open the game itself (the scope URL = index.html, same rules as any navigation).
      const url = new URL(scope.href);
      url.searchParams.set('notif', target);
      return self.clients.openWindow(url.href);
    })(),
  );
});
