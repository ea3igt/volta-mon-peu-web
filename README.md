# La volta al món a peu · web de dades

Pàgina responsive que transforma els tracks GPX públics d’Enric Luzan en un mapa i un conjunt d’estadístiques actualitzables.

## Què conserva

- distància acumulada, dies efectius, mitjanes, tracks i territoris;
- mapa complet, inici i final, extrems N/S/E/O i temperatures;
- evolució acumulada, volum mensual i distància, temperatura, freqüència cardíaca i desnivell per territori;
- etapa més llarga, ratxes, pausa, desnivell total i diari, altitud i relació ruta/línia recta;
- velocitat màxima calculada en una finestra sostinguda de cinc minuts;
- extrems de freqüència cardíaca, temperatura i densitat del rastre digital.

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
- Topònims: geocodificació inversa d’OpenStreetMap Nominatim, amb memòria cau local.
- La temperatura és la lectura del dispositiu; no s’interpreta com a temperatura ambiental.
- La velocitat màxima rebutja salts GPS i exigeix una finestra contínua d’almenys cinc minuts amb cadència registrada.
- El desnivell positiu és una estimació derivada de les mostres d’altitud del GPX.
