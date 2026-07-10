import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

import httpx

from app.config import get_notification_settings
from app.database import Alert

logger = logging.getLogger(__name__)


def _send_webhook(url: str, payload: dict) -> None:
    with httpx.Client(timeout=10) as client:
        resp = client.post(url, json=payload)
        resp.raise_for_status()


def _send_telegram(token: str, chat_id: str, text: str) -> None:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    with httpx.Client(timeout=10) as client:
        resp = client.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"})
        resp.raise_for_status()


def _send_bark(bark_url: str, title: str, body: str) -> None:
    url = bark_url.rstrip("/") + f"/{title}/{body}"
    with httpx.Client(timeout=10) as client:
        resp = client.get(url)
        resp.raise_for_status()


def _format_alert_text(alert: Alert) -> str:
    icons = {"error": "🔴", "warning": "🟡", "info": "🔵"}
    icon = icons.get(alert.level, "📢")
    return f"{icon} <b>{alert.title}</b>\n{alert.message}"


def dispatch_notifications(alerts: list[Alert]) -> None:
    if not alerts:
        return
    settings = get_notification_settings()
    if not settings.get("enabled", False):
        return

    webhook = (settings.get("webhook_url") or "").strip()
    telegram_token = (settings.get("telegram_bot_token") or "").strip()
    telegram_chat = (settings.get("telegram_chat_id") or "").strip()
    bark_url = (settings.get("bark_url") or "").strip()
    dingtalk = (settings.get("dingtalk_webhook") or "").strip()

    for alert in alerts:
        payload = {
            "event": "alert",
            "level": alert.level,
            "type": alert.alert_type,
            "title": alert.title,
            "message": alert.message,
            "account_id": alert.account_id,
            "video_id": alert.video_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        text = _format_alert_text(alert)

        if webhook:
            try:
                _send_webhook(webhook, payload)
            except Exception as exc:
                logger.warning("Webhook failed: %s", exc)

        if dingtalk:
            try:
                _send_webhook(
                    dingtalk,
                    {"msgtype": "text", "text": {"content": f"{alert.title}\n{alert.message}"}},
                )
            except Exception as exc:
                logger.warning("DingTalk failed: %s", exc)

        if telegram_token and telegram_chat:
            try:
                _send_telegram(telegram_token, telegram_chat, text)
            except Exception as exc:
                logger.warning("Telegram failed: %s", exc)

        if bark_url:
            try:
                _send_bark(bark_url, alert.title[:50], alert.message[:100])
            except Exception as exc:
                logger.warning("Bark failed: %s", exc)
