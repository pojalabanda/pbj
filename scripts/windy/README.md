# Avtomatski zajem Windy napovedi za PBJ

Posname Windy **Route planner (Boat)** za vsako etapo iz `routes.json` in shrani PNG v
`public/assets/<leto>/<etapa>/<run>Z.png` – enako kot ročno lani (npr. `2026-12-01-00Z.png`).
Stran `src/jadranje/<leto>/vreme.md` jih prikaže prek obstoječih `weather-route` / `weather-nav` includov.

## Enkratna priprava (na Macu)

```sh
cd ~/devel/pbj/scripts/windy
npm install
npx playwright install chromium
npm run login        # odpre okno: prijavi se v svoj Windy Premium račun, nato zapri okno
npm run test         # testni zajem z vidnim oknom v ./test-out (prepiše obstoječe)
```

Prijava je shranjena v `scripts/windy/.profile` (v `.gitignore`). Gesla skripta ne pozna in ga ne hrani.
Enote (kt, NM, °C) se vzamejo iz nastavitev tvojega Windy računa – preveri jih pri prijavi.

## Etape (`routes.json`)

- `windyRoute` – ime poti, shranjene v tvojem Windy računu (npr. `PBJ-01-Vrsar-Ilovik`); skripta jo poišče med priljubljenimi.
  `node capture.mjs --list` izpiše vse shranjene poti. Namesto imena lahko podaš `url` (URL iz Route plannerja).
- `departure` – čas starta po lokalnem času, npr. `2026-12-02T21:00`.
- `speedKt` – predvidena hitrost (lani ~5 kt: 53,7 NM v 11 h).
- `id` – ime mape (`a1`, `a2`, `a3`, za scenarij B `b1`…). Za novo mapo je potreben `npm start`/build,
  da Eleventy ustvari collection `<leto>_<id>`.

Ko se odločite za scenarij, popravi `routes.json` in `vreme.md` (glej `src/jadranje/2025/vreme.md`).

## Ročni zagon

```sh
npm run capture              # vse etape; obstoječ run preskoči
node capture.mjs --only a2   # samo ena etapa
node capture.mjs --headed    # vidno okno, za razhroščevanje
```

Ob napaki se posnetek zaslona shrani v `logs/error-<etapa>.png`, dnevnik v `logs/capture.log`.

## Samodejno (launchd), ~teden pred jadranjem

```sh
cp si.pojalabanda.pbj-windy.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/si.pojalabanda.pbj-windy.plist
# po jadranju:
launchctl unload ~/Library/LaunchAgents/si.pojalabanda.pbj-windy.plist
```

Teče 2× na dan, ob 10:00 (ECMWF run 00Z) in 22:00 (run 12Z); Mac mora biti prižgan (zamujen zagon po spanju launchd izvede ob bujenju).
Z `AUTO_DEPLOY=1` (dodaj v plist pod `EnvironmentVariables`) `run.sh` po novem posnetku še
naredi `git commit`, `npm run build` in `npm run deploy`. Privzeto je izklopljeno – posnetke pregledaš in objaviš sam.

Opomba: Windyjevi pogoji uporabe ne predvidevajo avtomatiziranega dostopa; skripta je mišljena za nizko
frekvenco (nekaj strani na dan) z lastnim Premium računom.
