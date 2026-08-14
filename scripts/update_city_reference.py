#!/usr/bin/env python3
"""Actualitza la referència local de ciutats principals de Natural Earth."""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path


SOURCE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_10m_populated_places_simple.geojson"
)
MIN_POPULATION = 50_000


def main() -> None:
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "LaVoltaAlMonAPeuStats/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        source = json.load(response)

    cities = []
    for feature in source["features"]:
        properties = feature["properties"]
        population = int(properties.get("pop_max") or 0)
        capital = bool(properties.get("adm0cap"))
        if population < MIN_POPULATION and not capital:
            continue
        lon, lat = feature["geometry"]["coordinates"]
        cities.append({
            "name": properties.get("nameascii") or properties["name"],
            "country": properties["adm0name"],
            "lon": round(lon, 5),
            "lat": round(lat, 5),
            "population": population,
            "min_zoom": float(properties.get("min_zoom") or 9),
            "capital": capital,
        })

    cities.sort(key=lambda city: (city["name"], city["country"]))
    output = Path(__file__).resolve().parents[1] / "data" / "major-cities.json"
    payload = {"source": SOURCE_URL, "minimum_population": MIN_POPULATION, "cities": cities}
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Referència actualitzada: {len(cities)} ciutats")


if __name__ == "__main__":
    main()
