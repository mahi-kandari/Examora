import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import requests


BACKEND_DIR = Path(__file__).resolve().parent
# Most containers have a read-only application directory. Set
# CHRONOS_CACHE_PATH=/tmp/examora-eta_cache.json (or a mounted volume) there.
CACHE_PATH = Path(os.getenv("CHRONOS_CACHE_PATH", str(BACKEND_DIR / "eta_cache.json")))
GOOGLE_MAPS_API_URL = "https://maps.googleapis.com/maps/api/directions/json"


def _parse_exam_date(exam_date_str: Any) -> datetime:
    if isinstance(exam_date_str, datetime):
        return exam_date_str

    if hasattr(exam_date_str, "year") and hasattr(exam_date_str, "month") and hasattr(exam_date_str, "day"):
        return datetime(exam_date_str.year, exam_date_str.month, exam_date_str.day)

    if not isinstance(exam_date_str, str):
        raise ValueError("exam_date_str must be a string or datetime-like value")

    for date_format in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%B %d, %Y"):
        try:
            return datetime.strptime(exam_date_str.strip(), date_format)
        except ValueError:
            continue

    return datetime.fromisoformat(exam_date_str.strip())


def _parse_time_on_exam_date(exam_date: datetime, time_str: str) -> datetime:
    time_text = time_str.strip().upper()
    for time_format in ("%I:%M %p", "%I:%M%p", "%H:%M"):
        try:
            parsed_time = datetime.strptime(time_text, time_format)
            return exam_date.replace(hour=parsed_time.hour, minute=parsed_time.minute, second=0, microsecond=0)
        except ValueError:
            continue
    raise ValueError(f"Unable to parse time value: {time_str}")


def _format_time(value: datetime) -> str:
    return value.strftime("%I:%M %p")


def _load_cache() -> dict[str, Any]:
    if not CACHE_PATH.exists():
        return {}

    try:
        with CACHE_PATH.open("r", encoding="utf-8") as cache_file:
            cache_data = json.load(cache_file)
        return cache_data if isinstance(cache_data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _save_cache(cache_data: dict[str, Any]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CACHE_PATH.open("w", encoding="utf-8") as cache_file:
        json.dump(cache_data, cache_file, indent=2)


def _cache_key(
    origin: str,
    destination: str,
    reporting_time_str: str,
    exam_date_str: Any,
) -> str:
    """Keep ETA samples isolated by route and exam time."""
    return json.dumps(
        {
            "origin": origin,
            "destination": destination,
            "reporting_time": reporting_time_str,
            "exam_date": str(exam_date_str),
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def get_travel_time_minutes(origin: str, destination: str, departure_datetime: datetime) -> float | None:
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_MAPS_API_KEY is not configured")

    response = requests.get(
        GOOGLE_MAPS_API_URL,
        params={
            "origin": origin,
            "destination": destination,
            "departure_time": int(departure_datetime.timestamp()),
            "traffic_model": "best_guess",
            "key": api_key,
        },
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()

    routes = payload.get("routes") or []
    if not routes:
        return None

    legs = routes[0].get("legs") or []
    if not legs:
        return None

    duration_in_traffic = legs[0].get("duration_in_traffic") or legs[0].get("duration")
    if not duration_in_traffic:
        return None

    return round(duration_in_traffic["value"] / 60, 2)


def precompute_eta_cache(
    origin: str,
    destination: str,
    reporting_time_str: str,
    exam_date_str: Any,
) -> dict[str, float | None]:
    exam_date = _parse_exam_date(exam_date_str)
    reporting_time = _parse_time_on_exam_date(exam_date, reporting_time_str)
    current_departure = max(
        reporting_time - timedelta(hours=3),
        exam_date.replace(hour=5, minute=0, second=0, microsecond=0),
    )

    cache: dict[str, float | None] = {}
    while current_departure <= reporting_time:
        time_key = _format_time(current_departure)
        try:
            cache[time_key] = get_travel_time_minutes(origin, destination, current_departure)
        except Exception:
            cache[time_key] = None
        current_departure += timedelta(minutes=15)

    all_cached_routes = _load_cache()
    all_cached_routes[_cache_key(origin, destination, reporting_time_str, exam_date_str)] = cache
    _save_cache(all_cached_routes)
    return cache


def calculate_safe_departure_simple(
    reporting_time_str: str,
    exam_date_str: Any,
    buffer_minutes: int = 45,
) -> tuple[str, str]:
    """Free (no external API) safe-departure estimate.

    Leaves ``buffer_minutes`` before the reporting time and assumes the trip
    consumes whatever remains after a ~30 minute arrival cushion. Returns
    ``(safe_departure_time, predicted_arrival_time)`` as ``'%I:%M %p'`` strings.

    This replaces the Directions-API-backed ``calculate_safe_departure`` in the
    confirm flow so the app stays entirely on free tiers.
    """
    exam_date = _parse_exam_date(exam_date_str)
    reporting_time = _parse_time_on_exam_date(exam_date, reporting_time_str)
    safe_departure = reporting_time - timedelta(minutes=buffer_minutes)
    assumed_travel = max(buffer_minutes - 30, 5)
    predicted_arrival = safe_departure + timedelta(minutes=assumed_travel)
    return _format_time(safe_departure), _format_time(predicted_arrival)


def calculate_safe_departure(
    origin: str,
    destination: str,
    reporting_time_str: str,
    exam_date_str: Any,
    buffer_minutes: int = 30,
) -> tuple[str, str]:
    exam_date = _parse_exam_date(exam_date_str)
    reporting_time = _parse_time_on_exam_date(exam_date, reporting_time_str)
    target_arrival = reporting_time - timedelta(minutes=buffer_minutes)

    cached_routes = _load_cache()
    cache = cached_routes.get(
        _cache_key(origin, destination, reporting_time_str, exam_date_str),
        {},
    )
    if not cache:
        cache = precompute_eta_cache(origin, destination, reporting_time_str, exam_date_str)

    sorted_departure_times = sorted(
        cache.keys(),
        key=lambda time_str: datetime.strptime(time_str, "%I:%M %p"),
    )

    safe_departure_time = None
    predicted_arrival_time = None

    for departure_time_str in reversed(sorted_departure_times):
        travel_minutes = cache.get(departure_time_str)
        if travel_minutes is None:
            continue

        departure_time = _parse_time_on_exam_date(exam_date, departure_time_str)
        arrival_time = departure_time + timedelta(minutes=float(travel_minutes))

        if arrival_time <= target_arrival:
            safe_departure_time = departure_time
            predicted_arrival_time = arrival_time
            break

    if safe_departure_time is None:
        safe_departure_time = reporting_time - timedelta(hours=1)
        travel_minutes = cache.get(_format_time(safe_departure_time))
        if travel_minutes is not None:
            predicted_arrival_time = safe_departure_time + timedelta(minutes=float(travel_minutes))
        else:
            predicted_arrival_time = target_arrival

    return _format_time(safe_departure_time), _format_time(predicted_arrival_time)
