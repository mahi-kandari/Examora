"""Scheduled notification engine.

`process_notifications()` scans confirmed exams, decides which psychological
messages are due for each user (based on their reminder intensity and the exam
timeline), sends them via FCM, and records what was sent to avoid duplicates.

The decision logic lives in the pure function `due_notifications(exam, profile,
now)` so it can be unit-tested without Firestore or the network.
"""

import logging
import random
from datetime import datetime, timedelta
from typing import Any

from firebase_admin import firestore

from backend.notifications import send_push

logger = logging.getLogger(__name__)

WEEKLY_MESSAGES = [
    "📖 Today's preparation becomes tomorrow's confidence.",
    "💪 One exam at a time. You've got this!",
]

_DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%B %d, %Y")
_TIME_FORMATS = ("%I:%M %p", "%I:%M%p", "%H:%M")

# Which message keys each intensity is allowed to receive.
_NERVOUS_KEYS = {
    "d7", "d3", "d1", "night_before", "morning",
    "pre_departure", "pre_reporting", "completed",
}
_RELAXED_KEYS = {"d1", "morning", "pre_departure", "completed"}


# ------------------------------------------------------------------
# Parsing helpers
# ------------------------------------------------------------------
def _parse_date(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value.strip(), fmt)
        except ValueError:
            continue
    return None


def _combine(date_dt: datetime | None, time_str: Any) -> datetime | None:
    """Combine a date with a clock-time string ('02:00 PM', '14:00') → datetime."""
    if date_dt is None or not isinstance(time_str, str) or not time_str.strip():
        return None
    text = time_str.strip().upper().replace(".", ":")
    for fmt in _TIME_FORMATS:
        try:
            parsed = datetime.strptime(text, fmt)
            return date_dt.replace(
                hour=parsed.hour, minute=parsed.minute, second=0, microsecond=0
            )
        except ValueError:
            continue
    return None


# ------------------------------------------------------------------
# Pure decision logic (unit-testable)
# ------------------------------------------------------------------
def due_notifications(
    exam: dict, profile: dict, now: datetime
) -> list[tuple[str, str, str]]:
    """Return the (key, title, body) notifications due for this exam at `now`.

    Pure: no I/O. The caller is responsible for de-duplicating against the
    exam's already-sent keys and for actually sending.
    """
    exam_date = _parse_date(exam.get("exam_date"))
    if exam_date is None:
        return []

    intensity = (profile.get("reminderIntensity") or "relaxed").strip().lower()
    first_name = (profile.get("firstName") or "there").strip() or "there"
    exam_title = exam.get("exam_title") or "your exam"
    reporting_time = exam.get("reporting_time") or "your reporting time"
    safe_departure = exam.get("safe_departure_time") or ""
    center_name = exam.get("center_name") or exam.get("center") or "your centre"

    report_dt = _combine(exam_date, exam.get("reporting_time"))
    depart_dt = _combine(exam_date, safe_departure)
    if depart_dt is None and report_dt is not None:
        # Fallback per spec: reporting time minus 30 minutes.
        depart_dt = report_dt - timedelta(minutes=30)

    days_until = (exam_date.date() - now.date()).days

    # (key, is_due, title, body)
    candidates: list[tuple[str, bool, str, str]] = [
        (
            "d7", days_until == 7, exam_title,
            f"📚 {exam_title} is in 7 days. This is a great time to start revising.",
        ),
        (
            "d3", days_until == 3, exam_title,
            f"⏳ Only 3 days left for {exam_title}. Make sure you've downloaded your admit card.",
        ),
        (
            "d1", days_until == 1, exam_title,
            f"🎯 Tomorrow is your {exam_title} exam. Reporting Time: {reporting_time}. "
            f"Leave home by {safe_departure or 'the recommended time'}.",
        ),
        (
            "night_before", days_until == 1 and now.hour >= 21, "Before you sleep",
            "🌙 Before you sleep... Keep your admit card and ID ready for tomorrow. Good Luck",
        ),
        (
            "morning", days_until == 0 and now.hour >= 6, exam_title,
            f"☀️ Good luck, {first_name}! Today is your {exam_title} exam. "
            f"Reporting: {reporting_time} Venue: {center_name}",
        ),
        (
            "pre_departure",
            days_until == 0 and depart_dt is not None and now >= depart_dt - timedelta(minutes=30),
            "Time to leave soon",
            "🚶 Time to leave soon. Don't forget: • Admit Card • ID Card • Water Bottle",
        ),
        (
            "pre_reporting",
            days_until == 0 and report_dt is not None and now >= report_dt - timedelta(minutes=60),
            "Reporting starts soon",
            "⏰ Reporting starts in 1 hour. Reach the center early to avoid stress.",
        ),
        (
            "completed", days_until <= -1, "Exam completed",
            f"🎉 Great job! {exam_title} has been marked as completed.",
        ),
    ]

    allowed = _NERVOUS_KEYS if intensity == "nervous" else _RELAXED_KEYS
    return [
        (key, title, body)
        for key, is_due, title, body in candidates
        if is_due and key in allowed
    ]


# ------------------------------------------------------------------
# Firestore-driven runner
# ------------------------------------------------------------------
def process_notifications(now: datetime | None = None, dry_run: bool = False) -> dict:
    """Send every notification due right now and return a summary.

    With ``dry_run=True``, notifications are logged but neither FCM nor
    Firestore is changed. This leaves the same notifications available for a
    later real run.
    """
    now = now or datetime.now()
    db = firestore.client()

    summary = {
        "exams_processed": 0,
        "notifications_sent": 0,
        "weekly_sent": 0,
        "dry_run": dry_run,
    }
    profile_cache: dict[str, dict] = {}
    relaxed_users_with_upcoming: set[str] = set()

    def _profile(uid: str) -> dict:
        if uid not in profile_cache:
            snap = db.collection("users").document(uid).get()
            profile_cache[uid] = (snap.to_dict() or {}) if snap.exists else {}
        return profile_cache[uid]

    exams = db.collection("exams").where("confirmation_status", "==", True).stream()
    for snap in exams:
        exam_id = getattr(snap, "id", "unknown")
        try:
            exam = snap.to_dict() or {}
            user_id = exam.get("userId")
            if not user_id:
                continue

            profile = _profile(user_id)
            token = profile.get("notificationToken")
            if not token or profile.get("notificationsEnabled", True) is False:
                continue

            summary["exams_processed"] += 1
            already_sent = set(exam.get("notifications_sent") or [])

            newly_sent: list[str] = []
            for key, title, body in due_notifications(exam, profile, now):
                if key in already_sent:
                    continue
                payload = {"examId": exam_id, "type": key}
                if dry_run:
                    logger.info(
                        "DRY RUN: Would send to %s…: %s – %s",
                        token[:12],
                        title,
                        body,
                    )
                    summary["notifications_sent"] += 1
                elif send_push(token, title, body, payload):
                    newly_sent.append(key)
                    summary["notifications_sent"] += 1

            if newly_sent and not dry_run:
                db.collection("exams").document(exam_id).update(
                    {"notifications_sent": firestore.ArrayUnion(newly_sent)}
                )

            exam_date = _parse_date(exam.get("exam_date"))
            intensity = (profile.get("reminderIntensity") or "relaxed").strip().lower()
            if intensity == "relaxed" and exam_date and exam_date.date() >= now.date():
                relaxed_users_with_upcoming.add(user_id)
        except Exception:  # noqa: BLE001 - one bad document must not stop the job
            logger.exception("Failed to process notifications for exam %s", exam_id)

    # Weekly motivational for relaxed users — once per ISO week, per user.
    iso_year, iso_week, _ = now.isocalendar()
    week_key = f"{iso_year}-W{iso_week:02d}"
    for user_id in relaxed_users_with_upcoming:
        try:
            profile = profile_cache.get(user_id, {})
            token = profile.get("notificationToken")
            if not token or profile.get("weeklyMotivationWeek") == week_key:
                continue
            weekly_body = random.choice(WEEKLY_MESSAGES)
            if dry_run:
                logger.info(
                    "DRY RUN: Would send to %s…: %s – %s",
                    token[:12],
                    "Examora",
                    weekly_body,
                )
                summary["notifications_sent"] += 1
            elif send_push(token, "Examora", weekly_body, {"type": "weekly"}):
                db.collection("users").document(user_id).update(
                    {"weeklyMotivationWeek": week_key}
                )
                summary["weekly_sent"] += 1
        except Exception:  # noqa: BLE001 - one user must not stop weekly notifications
            logger.exception("Failed to process weekly notification for user %s", user_id)

    logger.info("process_notifications summary: %s", summary)
    return summary
