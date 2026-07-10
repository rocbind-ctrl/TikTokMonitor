import re

_TIKTOK_URL_RE = re.compile(
    r"(?:https?://)?(?:www\.|m\.)?tiktok\.com/@([A-Za-z0-9._]+)",
    re.IGNORECASE,
)


def normalize_username(value: str) -> str:
    """从用户名、@用户名 或 TikTok 链接中提取纯用户名。"""
    value = (value or "").strip()
    if not value:
        return ""

    match = _TIKTOK_URL_RE.search(value)
    if match:
        return match.group(1)

    return value.lstrip("@").split("/")[0].split("?")[0].strip()


def parse_batch_line(line: str) -> dict | None:
    """解析批量导入行：用户名/链接[,大品类[,手机[,员工[,备注]]]]；兼容旧格式含「品」列。"""
    line = (line or "").strip()
    if not line or line.startswith("#"):
        return None

    parts = [p.strip() for p in line.split(",")]
    username = normalize_username(parts[0])
    if not username:
        return None

    # 旧格式 6 列：链接, 大品类, 品, 手机, 员工, 备注
    if len(parts) >= 6:
        return {
            "username": username,
            "group_name": parts[1],
            "phone": parts[3],
            "employee": parts[4],
            "note": parts[5],
        }

    return {
        "username": username,
        "group_name": parts[1] if len(parts) > 1 else "",
        "phone": parts[2] if len(parts) > 2 else "",
        "employee": parts[3] if len(parts) > 3 else "",
        "note": parts[4] if len(parts) > 4 else "",
    }


def apply_parsed_tags(account, parsed: dict, defaults: dict | None = None) -> None:
    """把解析出的标签写入账号；空字段不覆盖已有值，defaults 作 fallback。"""
    defaults = defaults or {}

    def pick(key: str) -> str:
        val = (parsed.get(key) or defaults.get(key) or "").strip()
        return val

    for key in ("group_name", "phone", "employee", "note"):
        val = pick(key)
        if val:
            setattr(account, key, val)
