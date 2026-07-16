#!/usr/bin/env python3
"""Recalcula les dades públiques de la volta a partir dels GPX."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import shutil
import statistics
import tempfile
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


REPO_ZIP = "https://github.com/Ercoman2/GPX-LVM/archive/refs/heads/main.zip"
SOURCE_URL = "https://github.com/Ercoman2/GPX-LVM"
TIMEZONES = {
    "Catalunya": "Europe/Madrid",
    "França": "Europe/Paris",
    "Itàlia": "Europe/Rome",
    "Croàcia": "Europe/Zagreb",
    "Montenegro": "Europe/Podgorica",
    "Albània": "Europe/Tirane",
    "Grècia": "Europe/Athens",
    "Turquia": "Europe/Istanbul",
    "Geòrgia": "Asia/Tbilisi",
}
MONTHS_CA = [
    "gen.", "febr.", "març", "abr.", "maig", "juny",
    "jul.", "ag.", "set.", "oct.", "nov.", "des.",
]
ELEVATION_RESAMPLE_METERS = 10.0
ELEVATION_SMOOTHING_POINTS = 7


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    radius = 6_371_000.0
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * radius * math.asin(min(1, math.sqrt(h)))


def elevation_gain_from_points(points: list[dict]) -> float:
    """Calcula l'ascens sobre un perfil regularitzat i filtrat per distància."""
    profile = [point for point in points if point.get("ele") is not None]
    if len(profile) < 2:
        return 0.0

    elevations = [profile[0]["ele"]]
    cumulative_distance = 0.0
    next_sample_distance = ELEVATION_RESAMPLE_METERS
    last_sample_distance = 0.0

    for previous, point in zip(profile, profile[1:]):
        segment_distance = haversine(
            (previous["lat"], previous["lon"]),
            (point["lat"], point["lon"]),
        )
        if segment_distance <= 0:
            continue
        while cumulative_distance + segment_distance >= next_sample_distance:
            fraction = (next_sample_distance - cumulative_distance) / segment_distance
            elevations.append(previous["ele"] + (point["ele"] - previous["ele"]) * fraction)
            last_sample_distance = next_sample_distance
            next_sample_distance += ELEVATION_RESAMPLE_METERS
        cumulative_distance += segment_distance

    if cumulative_distance - last_sample_distance >= ELEVATION_RESAMPLE_METERS / 2:
        elevations.append(profile[-1]["ele"])

    half_window = ELEVATION_SMOOTHING_POINTS // 2
    padded = (
        [elevations[0]] * half_window
        + elevations
        + [elevations[-1]] * half_window
    )
    filtered = []
    for index in range(len(elevations)):
        filtered.append(statistics.median(padded[index:index + ELEVATION_SMOOTHING_POINTS]))

    return sum(max(0.0, point - previous) for previous, point in zip(filtered, filtered[1:]))


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def read_rows(source: Path) -> list[dict]:
    rows = []
    with (source / "routes.csv").open(encoding="utf-8-sig", newline="") as handle:
        for raw in csv.reader(handle):
            if len(raw) < 7:
                continue
            rows.append({
                "stage": raw[0].strip(),
                "day": int(raw[1]),
                "date": date.fromisoformat(raw[2].strip()),
                "km": float(raw[3]),
                "file": raw[4].strip(),
                "activity": raw[5].strip(),
                "country": raw[6].strip(),
            })
    if not rows:
        raise RuntimeError("routes.csv no conté cap etapa")
    return rows


def read_track(path: Path) -> list[dict]:
    points = []
    for _, element in ET.iterparse(path, events=("end",)):
        if local_name(element.tag) != "trkpt":
            continue
        values = {"lat": float(element.attrib["lat"]), "lon": float(element.attrib["lon"])}
        for child in element.iter():
            name = local_name(child.tag)
            if name == "time":
                values["time"] = parse_time(child.text)
            elif name == "ele" and child.text:
                values["ele"] = float(child.text)
            elif name == "hr" and child.text:
                values["hr"] = float(child.text)
            elif name == "atemp" and child.text:
                values["temp"] = float(child.text)
            elif name == "cad" and child.text:
                values["cad"] = float(child.text)
        points.append(values)
        element.clear()
    return points


def event_record(point: dict, row: dict) -> dict:
    return {
        "date": row["date"].isoformat(),
        "time_utc": point.get("time").isoformat() if point.get("time") else None,
        "lat": point["lat"],
        "lon": point["lon"],
        "country": row["country"],
        "file": row["file"],
    }


def local_iso(record: dict) -> str | None:
    if not record.get("time_utc"):
        return None
    tz_name = TIMEZONES.get(record["country"])
    moment = datetime.fromisoformat(record["time_utc"])
    return moment.astimezone(ZoneInfo(tz_name)).isoformat() if tz_name else record["time_utc"]


def geocode_key(lat: float, lon: float) -> str:
    return f"{lat:.4f},{lon:.4f}"


def place_from_address(payload: dict, fallback: str) -> str:
    address = payload.get("address", {})
    local = next((address.get(key) for key in (
        "isolated_dwelling", "hamlet", "village", "town", "city", "suburb", "quarter"
    ) if address.get(key)), None)
    region = next((address.get(key) for key in ("state", "county", "province") if address.get(key)), None)
    country = address.get("country") or fallback
    parts = []
    for value in (local, region, country):
        if value and value not in parts:
            parts.append(value)
    return " · ".join(parts) if parts else fallback


def attach_place(record: dict, cache: dict, allow_network: bool) -> None:
    key = geocode_key(record["lat"], record["lon"])
    if key not in cache and allow_network:
        query = urllib.parse.urlencode({
            "format": "jsonv2",
            "lat": record["lat"],
            "lon": record["lon"],
            "zoom": 14,
            "addressdetails": 1,
            "accept-language": "ca,en",
        })
        request = urllib.request.Request(
            f"https://nominatim.openstreetmap.org/reverse?{query}",
            headers={"User-Agent": "LaVoltaAlMonAPeuStats/1.0 (public data visualisation)"},
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = json.load(response)
            cache[key] = place_from_address(payload, record["country"])
            time.sleep(1.1)
        except Exception:
            cache[key] = record["country"]
    record["place"] = cache.get(key, record["country"])
    record["local_time"] = local_iso(record)


def group_temperature_events(records: list[dict], cache: dict, allow_network: bool) -> list[dict]:
    by_file: dict[str, list[dict]] = defaultdict(list)
    for record in records:
        by_file[record["file"]].append(record)
    result = []
    for file_records in by_file.values():
        file_records.sort(key=lambda item: item.get("time_utc") or "")
        clusters = [[file_records[0]]]
        for record in file_records[1:]:
            previous = clusters[-1][-1]
            current_time = datetime.fromisoformat(record["time_utc"]) if record.get("time_utc") else None
            previous_time = datetime.fromisoformat(previous["time_utc"]) if previous.get("time_utc") else None
            if current_time and previous_time and (current_time - previous_time).total_seconds() > 1800:
                clusters.append([record])
            else:
                clusters[-1].append(record)
        for cluster in clusters:
            episode = dict(cluster[0])
            episode["end_time_utc"] = cluster[-1].get("time_utc")
            attach_place(episode, cache, allow_network)
            if episode.get("end_time_utc"):
                end_record = dict(episode)
                end_record["time_utc"] = episode["end_time_utc"]
                episode["end_local_time"] = local_iso(end_record)
            result.append(episode)
    return result


def download_source() -> tuple[Path, Path]:
    work = Path(tempfile.mkdtemp(prefix="volta-gpx-"))
    archive = work / "source.zip"
    request = urllib.request.Request(REPO_ZIP, headers={"User-Agent": "LaVoltaAlMonAPeuStats/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response, archive.open("wb") as handle:
        shutil.copyfileobj(response, handle)
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(work)
    source = next(path for path in work.iterdir() if path.is_dir() and (path / "routes.csv").exists())
    return source, work


def longest_streak(days: list[date]) -> tuple[int, date, date]:
    best = current = 1
    best_start = current_start = days[0]
    best_end = days[0]
    for previous, day in zip(days, days[1:]):
        if day == previous + timedelta(days=1):
            current += 1
        else:
            current = 1
            current_start = day
        if current > best:
            best = current
            best_start = current_start
            best_end = day
    return best, best_start, best_end


def build_stats(source: Path, cache: dict, allow_network: bool) -> dict:
    rows = read_rows(source)
    by_date: dict[date, float] = defaultdict(float)
    countries: dict[str, dict] = {}
    months: dict[str, dict] = defaultdict(lambda: {"km": 0.0, "days": set()})
    route: list[list[float]] = []
    route_last_kept: tuple[float, float] | None = None
    first_point = last_point = None
    source_latest_time = None
    gps_points = 0
    continuous_seconds = 0.0
    short_gap_seconds = 0.0
    short_gap_count = 0
    elevation_gain = 0.0
    elevation_gain_by_date: dict[date, float] = defaultdict(float)
    elevation_gain_countries_by_date: dict[date, set[str]] = defaultdict(set)
    altitude_max = None
    heart_min = heart_max = None
    heart_sum = heart_count = 0
    temp_min = temp_max = None
    temp_min_records: list[dict] = []
    temp_max_records: list[dict] = []
    cardinal = {"north": None, "south": None, "east": None, "west": None}
    speed_max = None

    for row in rows:
        by_date[row["date"]] += row["km"]
        month_key = row["date"].strftime("%Y-%m")
        months[month_key]["km"] += row["km"]
        months[month_key]["days"].add(row["date"])
        if row["country"] not in countries:
            countries[row["country"]] = {
                "km": 0.0,
                "track_days": set(),
                "first": row["date"],
                "last": row["date"],
                "elevation_gain": 0.0,
                "moving_seconds": 0.0,
                "temperatures_by_date": defaultdict(lambda: {"min": None, "max": None}),
            }
        country = countries[row["country"]]
        country["km"] += row["km"]
        country["track_days"].add(row["date"])
        country["first"] = min(country["first"], row["date"])
        country["last"] = max(country["last"], row["date"])

        points = read_track(source / row["file"])
        if not points:
            continue
        gps_points += len(points)
        timed = [point for point in points if point.get("time")]
        if len(timed) > 1:
            source_latest_time = max(source_latest_time or timed[-1]["time"], timed[-1]["time"])
            for previous, point in zip(timed, timed[1:]):
                gap = (point["time"] - previous["time"]).total_seconds()
                if 0 < gap <= 3600:
                    continuous_seconds += gap
                if 0 < gap <= 60:
                    short_gap_seconds += gap
                    short_gap_count += 1

        active_sequences: list[list[dict]] = []
        current_sequence = [timed[0]] if timed else []
        for previous, point in zip(timed, timed[1:]):
            seconds = (point["time"] - previous["time"]).total_seconds()
            distance = haversine((previous["lat"], previous["lon"]), (point["lat"], point["lon"]))
            instant_speed = distance / seconds * 3.6 if seconds > 0 else math.inf
            cadence = max(previous.get("cad", 0), point.get("cad", 0))
            if 0 < seconds <= 60 and instant_speed <= 12 and cadence > 0:
                current_sequence.append(point)
            else:
                if len(current_sequence) > 1:
                    active_sequences.append(current_sequence)
                current_sequence = [point]
        if len(current_sequence) > 1:
            active_sequences.append(current_sequence)

        country["moving_seconds"] += sum(
            (point["time"] - previous["time"]).total_seconds()
            for sequence in active_sequences
            for previous, point in zip(sequence, sequence[1:])
        )

        for sequence in active_sequences:
            cumulative = [0.0]
            for previous, point in zip(sequence, sequence[1:]):
                cumulative.append(cumulative[-1] + haversine((previous["lat"], previous["lon"]), (point["lat"], point["lon"])))
            right = 0
            for left in range(len(sequence)):
                right = max(right, left + 1)
                while right < len(sequence) and (sequence[right]["time"] - sequence[left]["time"]).total_seconds() < 300:
                    right += 1
                if right < len(sequence):
                    seconds = (sequence[right]["time"] - sequence[left]["time"]).total_seconds()
                    if seconds <= 360:
                        speed = (cumulative[right] - cumulative[left]) / seconds * 3.6
                        if speed_max is None or speed > speed_max["value"]:
                            speed_max = {"value": speed, **event_record(sequence[right], row)}

        for point in points:
            position = (point["lat"], point["lon"])
            if first_point is None:
                first_point = position
            last_point = position
            if route_last_kept is None or haversine(route_last_kept, position) >= 10_000:
                route.append([round(point["lon"], 5), round(point["lat"], 5)])
                route_last_kept = position

            record = event_record(point, row)
            if cardinal["north"] is None or point["lat"] > cardinal["north"]["lat"]:
                cardinal["north"] = record
            if cardinal["south"] is None or point["lat"] < cardinal["south"]["lat"]:
                cardinal["south"] = record
            if cardinal["east"] is None or point["lon"] > cardinal["east"]["lon"]:
                cardinal["east"] = record
            if cardinal["west"] is None or point["lon"] < cardinal["west"]["lon"]:
                cardinal["west"] = record

            elevation = point.get("ele")
            if elevation is not None:
                if altitude_max is None or elevation > altitude_max["value"]:
                    altitude_max = {"value": elevation, **record}

            heart = point.get("hr")
            if heart is not None and heart > 0:
                heart_sum += heart
                heart_count += 1
                if heart_min is None or heart < heart_min["value"]:
                    heart_min = {"value": heart, **record}
                if heart_max is None or heart > heart_max["value"]:
                    heart_max = {"value": heart, **record}

            temperature = point.get("temp")
            if temperature is not None:
                daily_temperature = country["temperatures_by_date"][row["date"]]
                if daily_temperature["min"] is None or temperature < daily_temperature["min"]:
                    daily_temperature["min"] = temperature
                if daily_temperature["max"] is None or temperature > daily_temperature["max"]:
                    daily_temperature["max"] = temperature
                temp_record = {"value": temperature, **record}
                if temp_min is None or temperature < temp_min:
                    temp_min = temperature
                    temp_min_records = [temp_record]
                elif temperature == temp_min:
                    temp_min_records.append(temp_record)
                if temp_max is None or temperature > temp_max:
                    temp_max = temperature
                    temp_max_records = [temp_record]
                elif temperature == temp_max:
                    temp_max_records.append(temp_record)

        track_elevation_gain = elevation_gain_from_points(points)
        elevation_gain += track_elevation_gain
        country["elevation_gain"] += track_elevation_gain
        elevation_gain_by_date[row["date"]] += track_elevation_gain
        elevation_gain_countries_by_date[row["date"]].add(row["country"])

        final = points[-1]
        final_lonlat = [round(final["lon"], 5), round(final["lat"], 5)]
        if not route or route[-1] != final_lonlat:
            route.append(final_lonlat)
            route_last_kept = (final["lat"], final["lon"])

    for record in [*cardinal.values(), heart_min, heart_max, altitude_max, speed_max]:
        if record:
            attach_place(record, cache, allow_network)

    temp_min_episodes = group_temperature_events(temp_min_records, cache, allow_network)
    temp_max_episodes = group_temperature_events(temp_max_records, cache, allow_network)

    walking_days = sorted(by_date)
    first_day, last_day = walking_days[0], walking_days[-1]
    total_km = sum(row["km"] for row in rows)
    calendar = []
    cumulative_km = 0.0
    cursor = first_day
    while cursor <= last_day:
        daily = by_date.get(cursor, 0.0)
        cumulative_km += daily
        calendar.append({"date": cursor.isoformat(), "km": round(daily, 2), "cumulative": round(cumulative_km, 2)})
        cursor += timedelta(days=1)

    streak_days, streak_start, streak_end = longest_streak(walking_days)
    gaps = [(right - left).days - 1 for left, right in zip(walking_days, walking_days[1:])]
    longest_gap = max(gaps, default=0)
    gap_index = gaps.index(longest_gap) if gaps else 0
    gap_start = walking_days[gap_index] + timedelta(days=1) if gaps else first_day
    gap_end = walking_days[gap_index + 1] - timedelta(days=1) if gaps else first_day
    longest_stage = max(rows, key=lambda row: row["km"])

    elevation_gain_max_day = None
    if elevation_gain_by_date:
        gain_date, gain_value = max(elevation_gain_by_date.items(), key=lambda item: item[1])
        country_order = [name for name, _ in sorted(countries.items(), key=lambda item: item[1]["first"])]
        elevation_gain_max_day = {
            "date": gain_date.isoformat(),
            "m": round(gain_value / 100) * 100,
            "countries": [name for name in country_order if name in elevation_gain_countries_by_date[gain_date]],
        }

    country_data = []
    for name, values in sorted(countries.items(), key=lambda item: item[1]["first"]):
        daily_temperatures = [
            (temperature["min"] + temperature["max"]) / 2
            for temperature in values["temperatures_by_date"].values()
            if temperature["min"] is not None and temperature["max"] is not None
        ]
        country_data.append({
            "name": name,
            "km": round(values["km"], 1),
            "stages": len(values["track_days"]),
            "natural_days": (values["last"] - values["first"]).days + 1,
            "temperature_average": round(sum(daily_temperatures) / len(daily_temperatures), 1)
            if daily_temperatures else None,
            "temperature_days": len(daily_temperatures),
            "average_speed_kmh": round(values["km"] / (values["moving_seconds"] / 3600), 1)
            if values["moving_seconds"] else None,
            "elevation_gain_m": round(values["elevation_gain"] / 100) * 100,
        })
    month_data = [
        {
            "key": key,
            "label": MONTHS_CA[int(key[5:7]) - 1],
            "km": round(values["km"], 1),
            "days": len(values["days"]),
            "average": round(values["km"] / len(values["days"]), 1),
        }
        for key, values in sorted(months.items())
    ]

    straight_km = haversine(first_point, last_point) / 1000 if first_point and last_point else 0
    routes_digest = hashlib.sha256((source / "routes.csv").read_bytes()).hexdigest()[:16]
    return {
        "meta": {
            "title": "La volta al món a peu",
            "traveller": "Enric Luzan",
            "source_url": SOURCE_URL,
            "data_as_of": last_day.isoformat(),
            "source_updated_at": source_latest_time.astimezone(timezone.utc).isoformat() if source_latest_time else None,
            "source_fingerprint": routes_digest,
        },
        "summary": {
            "total_km": round(total_km, 1),
            "walking_days": len(walking_days),
            "natural_days": (last_day - first_day).days + 1,
            "walking_average_km": round(total_km / len(walking_days), 1),
            "natural_average_km": round(total_km / ((last_day - first_day).days + 1), 1),
            "tracks": len(rows),
            "territories": len(countries),
            "first_date": first_day.isoformat(),
            "last_date": last_day.isoformat(),
            "straight_km": round(straight_km, 1),
            "route_ratio": round(total_km / straight_km, 2) if straight_km else None,
        },
        "route": route,
        "calendar": calendar,
        "countries": country_data,
        "months": month_data,
        "geographic_extremes": cardinal,
        "temperature": {
            "min": temp_min,
            "max": temp_max,
            "min_episodes": temp_min_episodes,
            "max_episodes": temp_max_episodes,
        },
        "heart_rate": {
            "average": round(heart_sum / heart_count) if heart_count else None,
            "min": heart_min,
            "max": heart_max,
        },
        "milestones": {
            "longest_stage": {
                "km": round(longest_stage["km"], 1),
                "date": longest_stage["date"].isoformat(),
                "country": longest_stage["country"],
            },
            "longest_streak": {
                "days": streak_days,
                "start": streak_start.isoformat(),
                "end": streak_end.isoformat(),
            },
            "longest_pause": {
                "days": longest_gap,
                "start": gap_start.isoformat(),
                "end": gap_end.isoformat(),
            },
            "altitude_max": altitude_max,
            "elevation_gain_m": round(elevation_gain / 100) * 100,
            "elevation_gain_max_day": elevation_gain_max_day,
            "speed_max_5min": speed_max,
        },
        "digital_trace": {
            "gps_points": gps_points,
            "sampled_hours": round(continuous_seconds / 3600),
            "typical_interval_seconds": round(short_gap_seconds / short_gap_count, 2) if short_gap_count else None,
            "continuous_gap_limit_seconds": 3600,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, help="Carpeta local del repositori GPX-LVM")
    parser.add_argument("--no-geocode", action="store_true", help="No consulta nous topònims")
    args = parser.parse_args()

    project = Path(__file__).resolve().parents[1]
    cache_path = project / "data" / "geocode-cache.json"
    output_path = project / "data" / "stats.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    temporary = None
    try:
        if args.source:
            source = args.source.resolve()
        else:
            source, temporary = download_source()
        stats = build_stats(source, cache, not args.no_geocode)
        output_path.write_text(json.dumps(stats, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"Dades actualitzades fins al {stats['meta']['data_as_of']}: {stats['summary']['total_km']:.1f} km")
    finally:
        if temporary:
            shutil.rmtree(temporary, ignore_errors=True)


if __name__ == "__main__":
    main()
