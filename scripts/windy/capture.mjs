#!/usr/bin/env node
// Avtomatski zajem Windy napovedi (Route planner, način Boat) za PBJ.
//
//   node capture.mjs --login        enkratna prijava v Windy Premium (odpre okno, prijaviš se sam)
//   node capture.mjs                zajem vseh etap iz routes.json (headless)
//   node capture.mjs --only a1      samo ena etapa
//   node capture.mjs --headed       z vidnim oknom (za razhroščevanje)
//   node capture.mjs --force        prepiše obstoječ posnetek istega runa
//   node capture.mjs --out DIR      shrani v DIR namesto v public/assets/<leto>/<etapa>/
//   node capture.mjs --list         izpiše shranjene poti iz Windy računa (in logs/favs.json)
//
// Ime datoteke = run modela (ECMWF) v UTC, enako kot lani: 2026-12-01-00Z.png
// Če posnetek za ta run že obstaja, ga preskoči – zato je skripto varno poganjati pogosto.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const profileDir = path.join(here, '.profile');          // Windy prijava (piškotki) – ni v gitu
const cfg = JSON.parse(fs.readFileSync(path.join(here, 'routes.json'), 'utf8'));

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('--only');
const outOverride = opt('--out');

const log = (...m) => console.log(new Date().toISOString(), ...m);

// "2026-12-02T21:00" (lokalni čas, Europe/Ljubljana) -> ms UTC
function localToUtcMs(s) {
  const [d, t] = s.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  const tz = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Ljubljana', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(tz.formatToParts(new Date(guess)).map(x => [x.type, x.value]));
  const asLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return guess - (asLocal - guess);
}

// Windy URL: /route-planner/boat/<točke>?<YYYY-MM-DD-HH>,<lat>,<lon>,<zoom>  (čas v UTC)
// points: "45.1530,13.5910;44.5,14.5;..."   view: ["44.85","13.95","9"] ali null (Windy sam prilagodi)
function buildUrl(route, points, view) {
  const dep = new Date(localToUtcMs(route.departure));
  const ts = dep.toISOString().slice(0, 13).replace('T', '-');
  const q = [ts, ...(view ?? [])].join(',');
  return { url: `https://www.windy.com/route-planner/boat/${points}?${q}`, depMs: dep.getTime() };
}

// Točke in pogled iz Windy URL-ja (route.url v routes.json)
function parseRouteUrl(href) {
  const u = new URL(href);
  const points = decodeURIComponent(u.pathname).replace(/^\/(route-planner|distance)(\/[a-z]+)?\//, '');
  const view = decodeURIComponent(u.search.slice(1)).split(',').filter(x => x && !/^\d{4}-\d{2}-\d{2}/.test(x));
  return { points, view: view.length === 3 ? view : null };
}

// Shranjena pot iz Windy računa (W.userFavs) -> točke "lat,lon;lat,lon;..."
// Oblika zapisa ni dokumentirana, zato iščemo previdno; ob težavi glej logs/favs.json (--list).
function favToPoints(fav) {
  const fmt = (lat, lon) => `${(+lat).toFixed(4)},${(+lon).toFixed(4)}`;
  const fromArr = (arr) => {
    if (!Array.isArray(arr) || arr.length < 2) return null;
    const pts = arr.map(p => Array.isArray(p) ? fmt(p[0], p[1])
      : (p && p.lat != null) ? fmt(p.lat, p.lon ?? p.lng) : null);
    return pts.every(Boolean) ? pts.join(';') : null;
  };
  // Windy: { type: 'route', title, route: 'boat/45.1600,13.5900;45.0500,13.6200;...' }
  if (typeof fav.route === 'string') {
    const pts = fav.route.replace(/^[a-z]+\//, '');
    if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?(;-?\d+(\.\d+)?,-?\d+(\.\d+)?)+$/.test(pts)) return pts;
  }
  for (const v of Object.values(fav)) {
    if (typeof v === 'string' && /route-planner|distance\//.test(v)) return parseRouteUrl(v.startsWith('http') ? v : 'https://www.windy.com/' + v.replace(/^\//, '')).points;
    if (typeof v === 'string' && /^-?\d+\.\d+,-?\d+\.\d+(;-?\d+\.\d+,-?\d+\.\d+)+$/.test(v)) return v;
    const a = fromArr(v); if (a) return a;
    if (v && typeof v === 'object') for (const w of Object.values(v)) {
      if (typeof w === 'string' && /^-?\d+\.\d+,-?\d+\.\d+(;-?\d+\.\d+,-?\d+\.\d+)+$/.test(w)) return w;
      const b = fromArr(w); if (b) return b;
    }
  }
  return null;
}

const HIDE_CSS = `
  #search, #logo-wrapper, #desktop-premium-icon, #mobile-premium-icon,
  #plugin-rhpane-top, #rhpane-top, #rh-bottom, #embed-zoom, #mobile-ovr-select,
  #open-in-app, .open-in-app, #plugin-cookie-consent, .cookie-consent { display: none !important; }
`;

async function main() {
  const headless = !(flag('--login') || flag('--headed'));
  const vp = cfg.viewport;
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless,
    channel: 'chromium',   // isti (polni) Chromium z in brez okna -> ista prijava
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    locale: 'en-GB',
    timezoneId: 'Europe/Ljubljana',
  });

  if (flag('--login')) {
    const page = ctx.pages()[0] ?? await ctx.newPage();
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('https://www.windy.com/login');
    console.log('\nPrijavi se v Windy v odprtem oknu (svoj Premium račun).');
    console.log('V Windy nastavitvah preveri enote: veter kt, razdalja NM, temperatura °C.');
    console.log('Ko končaš, zapri okno – prijava ostane shranjena v scripts/windy/.profile\n');
    // Na macOS zaprtje okna ne ugasne Chromiuma -> čakamo na zaprtje strani (ali Enter v terminalu)
    console.log('(ali pritisni Enter v tem terminalu)');
    await new Promise(r => {
      page.on('close', r);
      ctx.on('close', r);
      process.stdin.once('data', r);
    });
    process.stdin.pause();
    // preverimo prijavo v novem zavihku, preden zapremo brskalnik
    const chk = await ctx.newPage().catch(() => null);
    let ok = false;
    if (chk) {
      await chk.goto('https://www.windy.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
      ok = await chk.waitForFunction(() => window.W?.user?.isLoggedIn?.(), null, { timeout: 20000 })
        .then(() => true).catch(() => false);
    }
    await ctx.close().catch(() => {});
    console.log(ok ? 'Prijava uspešna in shranjena.' : 'POZOR: prijava ni zaznana – poskusi znova (npm run login).');
    return;
  }

  const page = ctx.pages()[0] ?? await ctx.newPage();
  let failed = 0;

  // Shranjene poti iz Windy računa
  let favs = [];
  if (cfg.routes.some(r => r.windyRoute) || flag('--list')) {
    await page.goto('https://www.windy.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.W?.userFavs, null, { timeout: 60000 });
    await page.waitForFunction(() => W.user?.isLoggedIn?.(), null, { timeout: 20000 })
      .catch(() => { throw new Error('Ni prijave v Windy – zaženi: npm run login'); });
    await page.waitForTimeout(2000);   // sinhronizacija priljubljenih
    favs = await page.evaluate(() => W.userFavs.getAll());
    fs.mkdirSync(path.join(here, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(here, 'logs', 'favs.json'), JSON.stringify(favs, null, 2));
    if (flag('--list')) {
      for (const f of favs) {
        const title = f.title ?? f.name ?? f.label ?? '(brez imena)';
        console.log(`${f.type ?? '?'}\t${title}\t${favToPoints(f) ?? ''}`);
      }
      console.log(`\nVse podrobnosti: ${path.join('logs', 'favs.json')}`);
      await ctx.close();
      return;
    }
  }

  for (const route of cfg.routes) {
    if (only && route.id !== only) continue;
    try {
      let points, view = null;
      if (route.windyRoute) {
        const fav = favs.find(f => f.type === 'route' && f.title?.trim() === route.windyRoute)
          ?? favs.find(f => Object.values(f).some(v => typeof v === 'string' && v.trim() === route.windyRoute));
        if (!fav) throw new Error(`Pot "${route.windyRoute}" ni med shranjenimi v Windy računu (glej: node capture.mjs --list)`);
        points = favToPoints(fav);
        if (!points) throw new Error(`Iz shranjene poti "${route.windyRoute}" ne znam prebrati točk – poglej logs/favs.json in mi ga pošlji, ali v routes.json dodaj "url"`);
      }
      if (!points && route.url) ({ points, view } = parseRouteUrl(route.url));
      if (!points) throw new Error('Etapa nima ne "windyRoute" ne "url"');
      const { url, depMs } = buildUrl(route, points, view);
      log(`${route.id}: ${url}`);
      // Windy včasih ob nalaganju odpre novico/pojavno okno in zapusti route planner -> zapri in poskusi znova
      for (let attempt = 1; attempt <= 3; attempt++) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.W?.products?.ecmwf?.calendar?.refTimeTs, null, { timeout: 60000 });
        await page.waitForTimeout(3000);
        for (const label of ['Reject', 'Allow anonymous analytics']) {
          const b = page.getByRole('button', { name: label }).or(page.getByText(label, { exact: true }));
          if (await b.first().isVisible().catch(() => false)) { await b.first().click().catch(() => {}); break; }
        }
        await page.keyboard.press('Escape').catch(() => {});
        if (page.url().includes('/route-planner/')) break;
        log(`${route.id}: Windy je zapustil route planner (${page.url()}), poskus ${attempt}`);
      }
      if (!page.url().includes('/route-planner/')) throw new Error('Route planner se ni odprl');

      // Prijava / Premium? Brez Premium Windy v route plannerju pokaže "Access Route Planner … Go Premium".
      await page.waitForTimeout(3000);
      const loggedIn = await page.evaluate(() => !!W.user?.isLoggedIn?.());
      const paywall = await page.getByText('Access Route Planner').filter({ visible: true }).count();
      if (!loggedIn || paywall > 0) throw new Error('Ni prijave v Windy Premium – zaženi: npm run login');

      await page.evaluate(({ model, overlay, depMs }) => {
        W.store.set('product', model);
        W.store.set('overlay', overlay);
        W.store.set('timestamp', depMs);
      }, { model: cfg.model, overlay: cfg.overlay ?? 'gust', depMs });

      // Hitrost jadrnice
      const speed = page.locator('.rplanner-speed__input');
      await speed.waitFor({ timeout: 30000 });
      await speed.fill(String(cfg.speedKt));
      await speed.press('Enter');

      await page.addStyleTag({ content: HIDE_CSS });
      await page.waitForTimeout(1500);   // da se hitrost upošteva v tabeli

      // Skrij rdečo vrstico (Display as / Speed / More) in gumb X, nato karto poravnaj na pot nad tabelo
      const latlngs = points.split(';').map(p => p.split(',').map(Number));
      const fit = await page.evaluate((pts) => {
        const st = document.createElement('style');
        st.textContent = '.rplanner-box { display: none !important; }';
        document.head.append(st);
        // Kje se konča karta: od zgoraj navzdol ob levem robu iščemo prvi element, ki ni del karte
        const m0 = W.map?.map;
        const mapEl = m0?.getContainer?.() ?? document.querySelector('.leaflet-container');
        let top = innerHeight * 0.6;
        for (let y = 60; y < innerHeight; y += 4) {
          const el = document.elementFromPoint(8, y);
          if (el && mapEl && !mapEl.contains(el)) { top = y; break; }
        }
        for (const e of document.querySelectorAll('[class*="close"], [class*="closing"], [aria-label*="lose"], [title*="lose"]')) {
          const r = e.getBoundingClientRect();
          if (r.width > 0 && r.width < 80 && r.left > innerWidth - 150 && Math.abs(r.top + r.height / 2 - top) < 70) e.style.display = 'none';
        }
        const m = W.map?.map;
        if (!m?.fitBounds) return 'ni W.map.map';
        const fitIt = () => m.fitBounds(pts, { paddingTopLeft: [40, 40], paddingBottomRight: [40, innerHeight - top + 50], animate: false });
        fitIt();
        window.__pbjFit = fitIt;   // ponovimo tik pred posnetkom, če bi Windy medtem premaknil karto
        return `rob karte y=${top}, zoom ${m.getZoom().toFixed(2)}`;
      }, latlngs);
      log(`${route.id}: karta ${fit}`);
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.__pbjFit?.());
      await page.waitForTimeout(3000);   // izris kart in tabele

      // Preveri, da je izbran pravi model (ECMWF) – sicer bi bila tabela iz drugega modela
      const product = await page.evaluate(() => W.store.get('product'));
      if (product !== cfg.model) throw new Error(`Izbran je model ${product}, pričakovan ${cfg.model}`);
      const refTs = await page.evaluate((m) => W.products[m].calendar.refTimeTs, cfg.model);
      const run = new Date(refTs).toISOString();
      const name = `${run.slice(0, 10)}-${run.slice(11, 13)}Z.png`;
      const dir = outOverride ? path.resolve(outOverride, route.id)
                              : path.join(repo, 'public/assets', String(cfg.year), route.id);
      const file = path.join(dir, name);
      if (fs.existsSync(file) && !flag('--force')) { log(`${route.id}: ${name} že obstaja – preskočeno`); continue; }
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: file });
      log(`${route.id}: shranjeno ${path.relative(repo, file)} (${product.toUpperCase()} run ${run.slice(0, 13)}Z)`);
    } catch (e) {
      failed++;
      log(`${route.id}: NAPAKA ${e.message}`);
      const dbg = path.join(here, 'logs', `error-${route.id}.png`);
      fs.mkdirSync(path.dirname(dbg), { recursive: true });
      await page.screenshot({ path: dbg }).catch(() => {});
    }
  }
  await ctx.close();
  process.exitCode = failed ? 1 : 0;
}

main().catch(e => { console.error(e); process.exit(1); });
