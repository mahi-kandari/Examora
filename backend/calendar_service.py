

import logging
from datetime import datetime, timedelta
from urllib.parse import quote

import requests
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------
CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
TIME_ZONE = "Asia/Kolkata"
DEFAULT_EVENT_DURATION_MINUTES = 180  # exam assumed to last ~3 hours
REQUEST_TIMEOUT_SECONDS = 10

# Reminders fire relative to the event start (the exam start time).
REMINDER_OVERRIDES = [
    {"method": "popup", "minutes": 120},   # 2 hours before
    {"method": "popup", "minutes": 1440},  # 1 day before
    {"method": "email", "minutes": 1440},  # 1 day before, via email
]


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _parse_clock_time(time_str):
    """Parse a clock time like '02:00 PM', '2.00 PM' or '14:00' → (hour, minute).

    Returns None if the value is empty or unrecognisable.
    """
    if not time_str or not isinstance(time_str, str):
        return None
    # Admit-card OCR often uses '2.00 PM'; normalise the separator.
    cleaned = time_str.strip().replace(".", ":")
    for fmt in ("%I:%M %p", "%I:%M%p", "%H:%M", "%I %p"):
        try:
            parsed = datetime.strptime(cleaned, fmt)
            return parsed.hour, parsed.minute
        except ValueError:
            continue
    logger.warning("Could not parse clock time: %r", time_str)
    return None


def _build_start_datetime(exam_date, exam_start_time, reporting_time):
    """Combine an ISO exam_date ('YYYY-MM-DD') with a clock time.

    Falls back to reporting_time, then to 09:00, when the start time is missing.
    Returns a naive datetime interpreted in TIME_ZONE, or None if the date is
    missing/invalid.
    """
    if not exam_date or not isinstance(exam_date, str):
        return None
    try:
        date_part = datetime.strptime(exam_date.strip()[:10], "%Y-%m-%d")
    except ValueError:
        logger.warning("Invalid exam_date for calendar event: %r", exam_date)
        return None

    hour_minute = _parse_clock_time(exam_start_time) or _parse_clock_time(reporting_time)
    if hour_minute is None:
        hour_minute = (9, 0)  # last-resort default
    hour, minute = hour_minute
    return date_part.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _format_datetime(value):
    """RFC3339 local datetime (no offset); the timeZone field supplies the zone."""
    return value.strftime("%Y-%m-%dT%H:%M:%S")


def _normalize_list(value):
    """Return a clean list of strings from a list or comma-separated string."""
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [part.strip() for part in value.split(",") if part.strip()]
    return []


def _resolve_location(exam_data):
    """Best location string for the event."""
    center_name = (exam_data.get("center_name") or "").strip()
    center_address = (exam_data.get("center_address") or exam_data.get("center") or "").strip()
    if center_name and center_address and center_name not in center_address:
        return f"{center_name}, {center_address}"
    return center_address or center_name


def _build_description(exam_data):
    """Human-readable event body with all exam-day details."""
    lines = []

    exam_date = exam_data.get("exam_date")
    start_time = exam_data.get("exam_start_time")
    reporting_time = exam_data.get("reporting_time")
    center_name = (exam_data.get("center_name") or "").strip()
    center_address = (exam_data.get("center_address") or exam_data.get("center") or "").strip()
    gate_details = (exam_data.get("gate_details") or "").strip()
    documents = _normalize_list(exam_data.get("required_documents"))
    instructions = _normalize_list(
        exam_data.get("extracted_instructions") or exam_data.get("instructions")
    )

    if exam_date:
        when = f"{exam_date} at {start_time}" if start_time else str(exam_date)
        lines.append(f"Exam date & time: {when}")
    if reporting_time:
        lines.append(f"Reporting time: {reporting_time}")
    if center_name:
        lines.append(f"Centre: {center_name}")
    if center_address:
        lines.append(f"Address: {center_address}")
    if gate_details:
        lines.append(f"Gate: {gate_details}")

    if documents:
        lines.append("")
        lines.append("Documents to bring:")
        lines.extend(f"  - {doc}" for doc in documents)

    if instructions:
        lines.append("")
        lines.append("Instructions:")
        lines.extend(f"  - {line}" for line in instructions)

    if center_address:
        maps_url = f"https://www.google.com/maps/search/?api=1&query={quote(center_address)}"
        lines.append("")
        lines.append(f"Directions: {maps_url}")

    lines.append("")
    lines.append("Created by Examora — your exam companion.")
    return "\n".join(lines)


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------
def create_exam_event(access_token: str, exam_data: dict) -> str | None:
    """Create a Google Calendar event for an exam and return its event id.

    Raises HTTPException(401) if the access token is missing/expired/invalid, and
    HTTPException(4xx/5xx) for other failures so the caller can decide whether to
    swallow the error (the /confirm handler does, to never block confirmation).
    """
    if not access_token:
        raise HTTPException(status_code=401, detail="Missing Google access token")

    start_dt = _build_start_datetime(
        exam_data.get("exam_date"),
        exam_data.get("exam_start_time"),
        exam_data.get("reporting_time"),
    )
    if start_dt is None:
        raise HTTPException(
            status_code=400,
            detail="Exam date is missing/invalid; cannot create calendar event",
        )
    end_dt = start_dt + timedelta(minutes=DEFAULT_EVENT_DURATION_MINUTES)

    event = {
        "summary": exam_data.get("exam_title") or "Exam",
        "description": _build_description(exam_data),
        "location": _resolve_location(exam_data),
        "start": {"dateTime": _format_datetime(start_dt), "timeZone": TIME_ZONE},
        "end": {"dateTime": _format_datetime(end_dt), "timeZone": TIME_ZONE},
        "reminders": {
            "useDefault": False,
            "overrides": REMINDER_OVERRIDES,
        },
    }

    try:
        response = requests.post(
            CALENDAR_API_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=event,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.exception("Network error calling Google Calendar API: %s", exc)
        raise HTTPException(status_code=502, detail="Could not reach Google Calendar") from exc

    if response.status_code in (401, 403):
        # Expired token, or the token lacks the calendar.events scope.
        logger.warning(
            "Google Calendar authorization failed (%s): %s",
            response.status_code,
            response.text,
        )
        raise HTTPException(status_code=401, detail="Google Calendar authorization failed")

    if response.status_code >= 400:
        logger.error(
            "Google Calendar API error (%s): %s", response.status_code, response.text
        )
        raise HTTPException(status_code=502, detail="Failed to create calendar event")

    event_id = response.json().get("id")
    logger.info("Created Google Calendar event: %s", event_id)
    return event_id
