from datetime import datetime, timezone

import yaml

from app.paths import CONFIG_PATH


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def get_tiktok_settings() -> dict:
    return load_config().get("tiktok", {})


def get_monitor_settings() -> dict:
    return load_config().get("monitor", {})


def get_alert_settings() -> dict:
    return load_config().get("alerts", {})


def get_notification_settings() -> dict:
    return load_config().get("notifications", {})


def get_security_settings() -> dict:
    return load_config().get("security", {})


def get_sync_settings() -> dict:
    return load_config().get("sync", {})


def get_intelligence_settings() -> dict:
    return load_config().get("intelligence", {})


def get_day_timezone() -> str:
    """统计「今日」日界时区，默认美区 Los Angeles。"""
    return get_monitor_settings().get("day_timezone", "America/Los_Angeles")


def get_server_settings() -> dict:
    return load_config().get("server", {})
