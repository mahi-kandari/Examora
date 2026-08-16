"""Firebase Cloud Messaging (FCM) helper.

Sends web push notifications to a single device token via the Firebase Admin
SDK. The Admin app is initialised in main.py; importing it here reuses that same
credential, so this module has no side effects on import.
"""

import logging

from firebase_admin import messaging

logger = logging.getLogger(__name__)


def send_push(token: str, title: str, body: str, data: dict | None = None) -> bool:
    """Send a push notification to one device token.

    Returns True on success, False on any failure (invalid/expired token,
    network error, etc.). Never raises, so callers in the notification loop can
    keep going.
    """
    if not token:
        logger.warning("send_push called with empty token; skipping")
        return False

    # FCM data payload values must all be strings.
    string_data = {str(k): str(v) for k, v in (data or {}).items()}

    message = messaging.Message(
        token=token,
        notification=messaging.Notification(title=title, body=body),
        data=string_data,
        webpush=messaging.WebpushConfig(
            notification=messaging.WebpushNotification(
                title=title,
                body=body,
                icon="/favicon.svg",
            ),
        ),
    )

    try:
        message_id = messaging.send(message)
        logger.info("Sent push to %s… (message %s)", token[:12], message_id)
        return True
    except messaging.UnregisteredError:
        # Token is no longer valid (app uninstalled / permission revoked).
        logger.warning("FCM token unregistered: %s…", token[:12])
        return False
    except Exception as exc:  # noqa: BLE001 - notifications must never crash the job
        logger.exception("Failed to send push to %s…: %s", token[:12], exc)
        return False
