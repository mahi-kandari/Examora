import math
import os
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env before importing project modules that read configuration.
# ``load_dotenv()`` alone searches from the process working directory, which
# can be the repository root or a deployment directory rather than backend/.
load_dotenv()
load_dotenv(Path(__file__).resolve().parent / ".env")

import logging
from datetime import datetime
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials, firestore

from backend.core import ExamExtractor
from backend.chronos import (
    calculate_safe_departure,
    calculate_safe_departure_simple,
    precompute_eta_cache,
)
from backend.notification_engine import process_notifications

# ------------------------------
# Setup
# ------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ------------------------------
# Logging
# ------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Firebase must be ready before the notification scheduler can send FCM pushes.
firebase_credentials = os.getenv("FIREBASE_CREDENTIALS")
if not firebase_credentials:
    raise RuntimeError(
        "FIREBASE_CREDENTIALS is required and must point to a Firebase "
        "service-account JSON file."
    )

if not firebase_admin._apps:
    firebase_admin.initialize_app(
        credentials.Certificate(os.getenv("FIREBASE_CREDENTIALS"))
    )

db = firestore.client()
exams_collection = db.collection("exams")

# ------------------------------
# FastAPI app
# ------------------------------
def _scheduler_interval_minutes() -> int:
    """Return a valid notification interval from the environment."""
    raw_interval = os.getenv("SCHEDULER_INTERVAL_MINUTES", "15")
    try:
        interval = int(raw_interval)
        if interval > 0:
            return interval
    except (TypeError, ValueError):
        pass

    logger.warning(
        "Invalid SCHEDULER_INTERVAL_MINUTES=%r; defaulting to 15 minutes",
        raw_interval,
    )
    return 15


def run_notification_job(*, dry_run: bool = False) -> dict | None:
    """Run one notification pass without allowing a failure to stop APScheduler."""
    logger.info("Notification job started")
    try:
        summary = process_notifications(dry_run=dry_run)
    except Exception:  # noqa: BLE001 - the next scheduled run must still happen
        logger.exception("Notification job failed; the next scheduled run will continue")
        return None

    logger.info("Notification job completed with summary: %s", summary)
    return summary


scheduler = BackgroundScheduler()
scheduler.add_job(
    run_notification_job,
    trigger=IntervalTrigger(minutes=_scheduler_interval_minutes()),
    id="process_notifications",
    replace_existing=True,
    max_instances=1,
    coalesce=True,
)


app = FastAPI(title="Examora Engine")


@app.on_event("startup")
def start_scheduler() -> None:
    """Start scheduled notification processing after FastAPI has started."""
    if os.getenv("GOOGLE_MAPS_API_KEY"):
        logger.info("Google Maps API key is configured. Traffic data will be available.")
    else:
        logger.warning(
            "Google Maps API key is missing. Traffic estimates and dynamic graphs "
            "will fall back to static/simple estimates."
        )

    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started")


@app.on_event("shutdown")
def stop_scheduler() -> None:
    """Gracefully stop the scheduler when FastAPI shuts down."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------
# Pydantic Models
# ------------------------------
class ConfirmationUpdate(BaseModel):
    corrected_fields: dict[str, Any]


class NotificationTriggerRequest(BaseModel):
    dry_run: bool = False

# ------------------------------
# Helpers
# ------------------------------
def _serialize_doc(doc_id: str, data: dict[str, Any]) -> dict[str, Any]:
    payload = dict(data)
    payload["id"] = doc_id
    return payload


def _generate_static_traffic_data(
    reporting_time_str: str,
    exam_date_str: str,
) -> dict[str, float]:
    """Build a realistic-looking bell-curve of *estimated* travel times.

    This is used as a visual fallback when the user granted location access
    but the Google Directions API is unavailable (no key, quota exhausted,
    etc.).  The data mirrors what ``precompute_eta_cache`` would return so
    the frontend chart renders the same way.
    """
    from backend.chronos import _parse_exam_date, _parse_time_on_exam_date, _format_time
    from datetime import timedelta

    exam_date = _parse_exam_date(exam_date_str)
    reporting_time = _parse_time_on_exam_date(exam_date, reporting_time_str)
    start_time = max(reporting_time - timedelta(hours=3), exam_date.replace(hour=5, minute=0, second=0, microsecond=0))
    cursor = start_time

    # --- Generate the time slots ---
    slots: list[datetime] = []
    while cursor <= reporting_time:
        slots.append(cursor)
        cursor += timedelta(minutes=15)

    if not slots:
        return {}

    n = len(slots)
    # Peak of the bell curve is around 45 % through the series
    peak_index = int(n * 0.45)
    sigma = max(n * 0.3, 1)

    base_travel = 22.0  # minutes — baseline
    peak_extra = 18.0   # extra minutes added at peak

    data: dict[str, float] = {}
    for i, slot in enumerate(slots):
        weight = math.exp(-0.5 * ((i - peak_index) / sigma) ** 2)
        travel = round(base_travel + peak_extra * weight, 1)
        data[_format_time(slot)] = travel

    return data

# ------------------------------
# Background Processing (OCR + LLM)
# ------------------------------
def _process_exam_in_background(doc_id: str, file_path: Path):
    """Runs OCR + LLM extraction and updates Firestore."""
    try:
        logger.info(f"Starting background processing for {doc_id}")
        extractor = ExamExtractor()
        extracted = extractor.process_file(str(file_path))

        # Update the Firestore document with results
        db.collection("exams").document(doc_id).update({
            **extracted,
            "status": "completed",
            "confirmation_status": False,
            "raw_ocr_text": extracted.get("raw_ocr_text", ""),
        })
        logger.info(f"Background processing complete for {doc_id}")
    except Exception as e:
        logger.error(f"Background processing failed for {doc_id}: {e}")
        db.collection("exams").document(doc_id).update({
            "status": "error",
            "error_message": str(e),
        })

# ------------------------------
# Endpoints
# ------------------------------
@app.post("/upload")
async def upload_exam(
    request: Request,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
):
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    original_name = Path(file.filename or "upload").name
    stored_filename = f"{timestamp}_{original_name}"
    file_path = UPLOAD_DIR / stored_filename

    contents = await file.read()
    file_path.write_bytes(contents)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authentication token")

    token = auth_header.removeprefix("Bearer ").strip()
    try:
        decoded_token = firebase_auth.verify_id_token(token)
        user_id = decoded_token.get("uid")
        if not user_id:
            raise ValueError("Token did not include a uid")
    except Exception as exc:
        logger.warning("Upload token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid authentication token") from exc

    # Create placeholder document with status "processing"
    doc_ref = exams_collection.document()
    doc_ref.set({
        "filename": stored_filename,
        "upload_timestamp": datetime.utcnow().isoformat(),
        "status": "processing",
        "userId": user_id,
    })

    # Kick off background processing (does OCR + AI in the background)
    background_tasks.add_task(_process_exam_in_background, doc_ref.id, file_path)

    # Return instantly – frontend will poll Firestore
    return {"id": doc_ref.id}


@app.put("/confirm/{exam_id}")
def confirm_exam(exam_id: str, payload: ConfirmationUpdate, request: Request):
    doc_ref = exams_collection.document(exam_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Exam not found")

    existing_data = snapshot.to_dict() or {}
    corrected_fields = payload.corrected_fields or {}
    update_data = dict(corrected_fields)
    # ``origin`` is supplied only to calculate the travel plan. Do not persist
    # precise coordinates in the exam document.
    raw_origin = update_data.pop("origin", None)
    origin = raw_origin.strip() if isinstance(raw_origin, str) and raw_origin.strip() else None
    update_data["confirmation_status"] = True
    update_data["corrected_data"] = dict(update_data)

    location_shared = bool(origin or corrected_fields.get("location_shared") or corrected_fields.get("location_permission") == "granted")
    update_data["location_permission"] = "granted" if location_shared else "denied"
    update_data["location_shared"] = location_shared

    reporting_time = corrected_fields.get("reporting_time") or existing_data.get("reporting_time")
    exam_date = corrected_fields.get("exam_date") or existing_data.get("exam_date")
    raw_destination = (
        corrected_fields.get("center_address")
        or existing_data.get("center_address")
        or existing_data.get("center")
    )
    destination = (
        raw_destination.strip()
        if isinstance(raw_destination, str) and raw_destination.strip()
        else None
    )

    # Build the chart series independently of the departure recommendation.
    # Only real Directions results are stored; the UI has an explicit
    # unavailable state when location or an API key is absent.
    traffic_data: dict[str, float] | None = None
    if origin and destination and reporting_time and exam_date and os.getenv("GOOGLE_MAPS_API_KEY"):
        try:
            eta_samples = precompute_eta_cache(
                origin,
                destination,
                reporting_time,
                exam_date,
            )
            traffic_data = {
                departure_time: float(duration)
                for departure_time, duration in eta_samples.items()
                if isinstance(duration, (int, float)) and not isinstance(duration, bool)
            }
            if not traffic_data:
                traffic_data = None
                logger.warning("Directions returned no usable ETA samples for %s", exam_id)
        except Exception:  # noqa: BLE001 - traffic data must not block confirmation
            logger.exception("Traffic data calculation failed for %s", exam_id)

    # If the user shared their location but we couldn't get real data,
    # generate static estimated data so they still see a static dummy graph.
    if traffic_data is None and location_shared and reporting_time and exam_date:
        try:
            traffic_data = _generate_static_traffic_data(reporting_time, exam_date)
            traffic_data_source = "estimated"
            logger.info("Generated static fallback traffic data for %s", exam_id)
        except Exception:  # noqa: BLE001
            logger.exception("Static traffic fallback also failed for %s", exam_id)
            traffic_data_source = None
    elif traffic_data:
        traffic_data_source = "live"
    else:
        traffic_data_source = None

    update_data["traffic_data"] = traffic_data
    update_data["traffic_data_source"] = traffic_data_source

    if not destination:
        # Without an address, a Directions result would be unreliable. The
        # notification engine will use its reporting-time fallback instead.
        update_data["safe_departure_time"] = None
        update_data["predicted_arrival_time"] = None
        logger.warning("No centre address for %s; skipping travel calculation", exam_id)
    elif reporting_time and exam_date:
        try:
            if origin and os.getenv("GOOGLE_MAPS_API_KEY"):
                try:
                    safe_dep, predicted_arr = calculate_safe_departure(
                        origin,
                        destination,
                        reporting_time,
                        exam_date,
                    )
                    logger.info("Calculated Directions-based travel plan for %s", exam_id)
                except Exception:  # noqa: BLE001 - always retain free fallback
                    logger.exception(
                        "Directions calculation failed for %s; using simple fallback",
                        exam_id,
                    )
                    safe_dep, predicted_arr = calculate_safe_departure_simple(
                        reporting_time,
                        exam_date,
                    )
            else:
                safe_dep, predicted_arr = calculate_safe_departure_simple(
                    reporting_time,
                    exam_date,
                )
            update_data["safe_departure_time"] = safe_dep
            update_data["predicted_arrival_time"] = predicted_arr
        except Exception as exc:
            logger.exception("Chronos calculation failed for %s: %s", exam_id, exc)
            update_data["safe_departure_time"] = None
            update_data["predicted_arrival_time"] = None
    else:
        update_data["safe_departure_time"] = None
        update_data["predicted_arrival_time"] = None
        logger.warning("Missing exam date or reporting time for %s; skipping travel calculation", exam_id)

    doc_ref.update(update_data)

    updated_snapshot = doc_ref.get()
    updated_data = updated_snapshot.to_dict() or {}

    return _serialize_doc(updated_snapshot.id, updated_data)


@app.get("/exam/{exam_id}")
def get_exam(exam_id: str):
    doc_ref = exams_collection.document(exam_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Exam not found")

    return _serialize_doc(snapshot.id, snapshot.to_dict() or {})


@app.post("/trigger-notifications")
def trigger_notifications(request: Request):
    """Run the scheduled notification pass.

    Protected by a shared secret so it can be safely called by an external free
    cron service (e.g. cron-job.org). Set NOTIFICATIONS_CRON_SECRET in the env
    and send it as the `X-Cron-Secret` header.
    """
    expected_secret = os.getenv("NOTIFICATIONS_CRON_SECRET")
    if not expected_secret:
        raise HTTPException(status_code=503, detail="Notification trigger not configured")
    if request.headers.get("X-Cron-Secret") != expected_secret:
        raise HTTPException(status_code=401, detail="Invalid cron secret")

    summary = process_notifications()
    return {"status": "ok", **summary}


@app.post("/notifications/trigger")
def trigger_notification_job(payload: NotificationTriggerRequest | None = None):
    """Manually run one notification pass for ad-hoc testing.

    Pass ``{"dry_run": true}`` to inspect notifications that would be sent without
    calling FCM or changing Firestore de-duplication state.
    """
    summary = run_notification_job(dry_run=payload.dry_run if payload else False)
    if summary is None:
        raise HTTPException(status_code=500, detail="Notification job failed")
    return summary
