# La volta al món a peu · web de dades

Pàgina responsive que transforma els tracks GPX públics d’Enric Luzan en un mapa i un conjunt d’estadístiques actualitzables.

## Què conserva

- distància acumulada, dies efectius, mitjanes, tracks i territoris;
- mapa complet, inici i final, extrems N/S/E/O i temperatura màxima;
- evolució acumulada, volum mensual i distància, velocitat mitjana i desnivell per territori;
- etapa més llarga, ratxes, pausa, desnivell total i diari, altitud i relació ruta/línia recta;
- velocitat màxima calculada en una finestra sostinguda de cinc minuts;
- extrems de freqüència cardíaca, temperatura màxima i densitat del rastre digital.

## Actualització manual

Des de l’arrel del projecte:

```powershell
python scripts/update_data.py
```

L’script descarrega la branca `main` del repositori públic `Ercoman2/GPX-LVM`, recalcula totes les magnituds i actualitza `data/stats.json`. Els topònims es desen a `data/geocode-cache.json` per evitar consultes repetides.

Per treballar amb una còpia local dels GPX:

```powershell
python scripts/update_data.py --source "C:\ruta\a\GPX-LVM-main" --no-geocode
```

## Visualització local

Com que el web carrega un fitxer JSON, cal obrir-lo amb un servidor local:

```powershell
python -m http.server 8080
```

Després, obre `http://localhost:8080`.

## Comprovació periòdica i publicació

La planificació principal s'executa amb el Cloudflare Worker `volta-mon-peu-scheduler`. El seu Cron Trigger és `5-59/10 * * * *`: comprova si el manifest `routes.csv` de la font ha canviat als minuts **05, 15, 25, 35, 45 i 55** de cada hora. Per fer-ho, calcula el seu SHA-256 i el compara amb `meta.source_fingerprint` del `data/stats.json` publicat. Només quan són diferents demana a l'API de GitHub que iniciï `.github/workflows/actualitza-i-publica.yml` sobre la branca `main` mitjançant `workflow_dispatch`, indicant `origen=cloudflare`.

El codi canònic del Worker es conserva a `cloudflare/worker.js`. El Worker no necessita emmagatzematge propi: el fingerprint anterior queda persistent al repositori i a GitHub Pages dins de `data/stats.json`. Les consultes es fan sense memòria cau. Si no es pot descarregar o interpretar algun dels dos fitxers, el Worker aplica un criteri segur i inicia igualment GitHub Actions perquè una incidència temporal no impedeixi incorporar dades noves.

El Worker utilitza el secret xifrat `GITHUB_TOKEN`, que conté un token de GitHub d'accés detallat, restringit al repositori `ea3igt/volta-mon-peu-web` i amb permís d'escriptura per a GitHub Actions. El secret ha de formar part de la versió activa del Worker, amb el 100% del trànsit. El token no es desa mai al repositori.

Com a reforç, GitHub Actions conserva dues actualitzacions programades a les **00:37 i 12:37, hora de Catalunya**, vint minuts després de la planificació principal de Cloudflare. GitHub interpreta els cron en UTC i no permet indicar-hi directament `Europe/Madrid`; per respectar automàticament l'horari d'estiu i el d'hivern, el workflow declara quatre hores UTC candidates i el job `valida_horari` només autoritza les dues que corresponen al desplaçament vigent (`+0200` o `+0100`). Les altres dues execucions candidates queden omeses abans de descarregar o publicar res.

Quan Cloudflare detecta un canvi, i també en les dues execucions de reforç, GitHub Actions fa aquest procés:

1. descarregar els GPX i recalcular les dades;
2. desar els canvis al repositori quan hi hagi una etapa nova;
3. comparar el fingerprint de `data/stats.json` del repositori amb el que serveix realment GitHub Pages;
4. publicar el web si les dades han canviat o si la versió pública ha quedat endarrerida.

`scripts/update_data.py` conserva `meta.updated_at` quan totes les dades calculades són idèntiques; per tant, una comprovació sense novetats no modifica artificialment `data/stats.json`. Els reforços de les 00:37 i les 12:37 sempre recalculen la font completa, de manera que també poden detectar correccions d'un GPX encara que `routes.csv` no hagi canviat. Si el repositori i el web públic ja coincideixen, ometen el commit i el desplegament.

La segona comprovació evita un punt feble: si GitHub aconsegueix desar les dades noves al repositori però falla durant el desplegament de Pages, la següent execució detecta que el fingerprint públic encara és antic i torna a publicar encara que el recàlcul ja no generi cap canvi. Si no es pot descarregar o interpretar el `stats.json` públic, el workflow aplica un criteri segur i també intenta publicar.

Els `push` a `main` continuen activant el procés, però només forcen una publicació si modifiquen fitxers visibles (`index.html`, `assets/` o `data/`), si el recàlcul canvia les dades o si el web públic està endarrerit. Per tant, canvis exclusivament documentals o tècnics —com `README.md`, `cloudflare/`, `scripts/` o `.github/`— no generen un desplegament innecessari quan les dades ja estan sincronitzades. L'execució manual des de GitHub Actions sí que continua forçant la publicació. A Cloudflare, una comprovació sense novetats apareix a **Observability** amb el missatge `No hi ha dades noves; no s'inicia GitHub.`; quan detecta un canvi, apareix `Workflow de GitHub iniciat correctament.` i a GitHub es crea una execució `workflow_dispatch`.

Quan caduqui el token de GitHub, cal crear-ne un de nou amb els mateixos límits i permisos, substituir el valor de `GITHUB_TOKEN` a **Cloudflare → Workers & Pages → volta-mon-peu-scheduler → Settings → Variables and Secrets** i desplegar la versió nova perquè quedi activa.

### Manteniment coordinat del recordatori

El calendari principal conté l'esdeveniment **«Renovar i validar el token de GitHub de La volta al món a peu»**, programat inicialment per al **23 d'agost de 2027 a les 09:00**, una setmana abans de la caducitat prevista del token. Les seves instruccions formen part de la documentació operativa del projecte.

Abans de donar per tancat qualsevol canvi que afecti el Worker, el Cron Trigger, `GITHUB_TOKEN`, el workflow de GitHub Actions, la detecció de noves dades o la publicació de Pages, cal revisar també aquest esdeveniment i actualitzar-lo si el procediment de renovació o verificació ha canviat. Quan es renovi el token, s'hi ha d'anotar la caducitat nova i traslladar el recordatori a una setmana abans. Això evita que el calendari conservi instruccions obsoletes encara que el codi i aquest README estiguin actualitzats.

### Comprovació obligatòria després de canvis a Cloudflare

Cloudflare separa les **versions desades** del **desplegament actiu**. Modificar el codi, afegir un secret o canviar un binding pot crear una versió nova sense assignar-li automàticament el trànsit del Worker. Que una versió aparegui com a `Latest` o a `Version History` no garanteix que sigui la que atén les peticions o els Cron Triggers.

Després de qualsevol canvi de codi, secret o binding:

1. obrir **Deployments**;
2. comprovar que la versió que conté el canvi aparegui a **Active deployment**;
3. comprovar que tingui el **100% del trànsit**;
4. si només figura a **Version History**, obrir el menú `···`, seleccionar **Deploy version** o **Promote** i assignar-li el 100%;
5. verificar a **Observability** una execució sense errors i, en aquest projecte, confirmar a GitHub Actions que s'ha creat una execució `workflow_dispatch`.

Un canvi exclusiu del Cron Trigger no crea necessàriament una versió de codi i no requereix `Deploy version`; cal desar-lo a **Settings → Trigger events**, recarregar la pàgina per confirmar l'horari i deixar fins a 15 minuts perquè es propagui. En canvi, qualsevol canvi de codi, secrets o bindings exigeix comprovar explícitament la versió activa.

Per activar-ho, crea un repositori de GitHub amb aquests fitxers i, a **Settings → Pages → Build and deployment**, selecciona **GitHub Actions**.

## Fonts i criteris

- Dades de ruta: [Ercoman2/GPX-LVM](https://github.com/Ercoman2/GPX-LVM).
- El mapa separa el traçat enregistrat en segments i uneix amb una línia vermella puntejada els salts superiors a 50 metres entre tracks consecutius o entre segments GPX diferenciats. La distància normal entre punts d’un mateix segment no es considera un buit de track.
- El mapa és interactiu: permet zoom amb la roda, gest de pinça, controls o teclat, i desplaçament per arrossegament. A partir de 2× substitueix la ruta general per una geometria detallada mostrejada aproximadament cada 200 metres.
- Els països recorreguts es destaquen amb un gris més fosc. La detecció es fa automàticament comprovant en quin polígon geogràfic cau el punt representatiu de cada territori, de manera que també s'aplica als països nous que s'incorporin a la ruta.
- Els noms dels territoris recorreguts i de les ciutats principals es distribueixen dinàmicament segons l’espai disponible. Les ciutats provenen de Natural Earth (població mínima de 50.000 habitants o capitals) i només s’incorporen si el track passa a menys de 15 km; en ampliar el mapa n’apareixen progressivament més.
- Topònims: geocodificació inversa d’OpenStreetMap Nominatim, amb memòria cau local.
- Ciutats del mapa: [Natural Earth · Populated Places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/), referència local actualitzable amb `python scripts/update_city_reference.py`.
- La temperatura màxima és la lectura del dispositiu; no s’interpreta com a temperatura ambiental.
- Catalunya es manté sempre com un territori estadístic independent d’Espanya; els trams de Catalunya i de la resta d’Espanya no s’agrupen.
- Les etapes per territori són els dies diferents amb almenys un track; els dies naturals són el període inclusiu entre el primer i l’últim dia amb track al territori.
- La distància mitjana per etapa de cada territori divideix els quilòmetres totals pel nombre de dies diferents amb almenys un track.
- La velocitat mitjana de cada territori divideix la distància total pel temps dels trams en moviment, amb cadència registrada i sense salts GPS.
- La velocitat màxima rebutja salts GPS i exigeix una finestra contínua d’almenys cinc minuts amb cadència registrada.
- El desnivell positiu es calcula sobre un perfil reomplert cada 10 metres. Només se sumen pujades confirmades d’almenys 3 metres, que es tanquen quan el perfil baixa 3 metres des del cim local; així s’eviten les petites oscil·lacions del GPS sense perdre els ascensos reals.
