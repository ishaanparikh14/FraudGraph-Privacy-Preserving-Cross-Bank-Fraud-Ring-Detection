"""Normalize transaction_id for SQLite lookup (Spring UUIDs are lowercase; paste often adds noise)."""


def normalize_txn_id(raw) -> str:
    if raw is None:
        return ""
    s = str(raw).strip()
    # Strip BOM / zero-width / NBSP from sloppy copy-paste
    for ch in ("\ufeff", "\u200b", "\u00a0"):
        s = s.replace(ch, "")
    s = s.strip()
    return s.lower()
