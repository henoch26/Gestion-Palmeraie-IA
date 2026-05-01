from __future__ import annotations

import csv
import io
from decimal import Decimal, InvalidOperation
from typing import Any

from django.http import HttpResponse


def clean_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def parse_int(value: Any, default: int | None = None) -> int | None:
    s = clean_str(value)
    if s == "":
        return default
    try:
        return int(float(s))
    except Exception:
        return default


def parse_decimal(value: Any, default: Decimal | None = None) -> Decimal | None:
    s = clean_str(value)
    if s == "":
        return default
    try:
        return Decimal(s.replace(",", "."))
    except (InvalidOperation, Exception):
        return default


def read_uploaded_csv(uploaded_file) -> list[dict[str, str]]:
    raw = uploaded_file.read()
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows: list[dict[str, str]] = []
    for row in reader:
        cleaned = {clean_str(k): clean_str(v) for k, v in (row or {}).items()}
        rows.append(cleaned)
    return rows


def csv_template_response(filename: str, fieldnames: list[str], example_rows: list[dict[str, Any]] | None = None):
    resp = HttpResponse(content_type="text/csv")
    resp["Content-Disposition"] = f"attachment; filename={filename}"
    writer = csv.DictWriter(resp, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in (example_rows or []):
        writer.writerow(row)
    return resp

