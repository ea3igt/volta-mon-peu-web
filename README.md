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

## Publicació i actualització diària

El fitxer `.github/workflows/actualitza-i-publica.yml` està preparat per:

1. executar-se cada dia a les 05:17 UTC;
2. descarregar els GPX i recalcular les dades;
3. desar els canvis al repositori quan hi hagi una etapa nova;
4. publicar la versió actualitzada amb GitHub Pages.

Per activar-ho, crea un repositori de GitHub amb aquests fitxers i, a **Settings → Pages → Build and deployment**, selecciona **GitHub Actions**.

## Fonts i criteris

- Dades de ruta: [Ercoman2/GPX-LVM](https://github.com/Ercoman2/GPX-LVM).
- El mapa separa el traçat enregistrat en segments i uneix amb una línia vermella puntejada els salts superiors a 50 metres entre tracks consecutius o entre segments GPX diferenciats. La distància normal entre punts d’un mateix segment no es considera un buit de track.
- El mapa és interactiu: permet zoom amb la roda, gest de pinça, controls o teclat, i desplaçament per arrossegament. A partir de 2× substitueix la ruta general per una geometria detallada mostrejada aproximadament cada 200 metres.
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
