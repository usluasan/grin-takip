"""Yanıt şeması sözleşmesi (SPEC §6.1 / web/src/types.ts) — DB gerektirmeyen denetimler."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app import carbon
from app.common import bat_pct, live_state, parse_dt
from app.routers.dashboard import period_range
from app.routers.savings import audit_rows

UTC = timezone.utc


def test_parse_dt_date_only_and_iso():
    assert parse_dt("2026-10-04") == datetime(2026, 10, 4, tzinfo=UTC)
    assert parse_dt("2026-10-04", end=True) == datetime(2026, 10, 5, tzinfo=UTC)
    assert parse_dt("2026-10-04T10:30:00Z") == datetime(2026, 10, 4, 10, 30, tzinfo=UTC)
    assert parse_dt("2026-10-04T10:30:00") == datetime(2026, 10, 4, 10, 30, tzinfo=UTC)
    assert parse_dt(None) is None and parse_dt("") is None
    with pytest.raises(HTTPException):
        parse_dt("bugün")


def test_bat_pct_matches_web_util():
    assert bat_pct(None) is None
    assert bat_pct(3.3) == 0
    assert bat_pct(4.2) == 100
    assert bat_pct(3.92) == 69
    assert bat_pct(5.0) == 100


def test_live_state_offline_threshold():
    now = datetime(2026, 10, 4, 12, tzinfo=UTC)
    assert live_state("mowing", now - timedelta(minutes=1), now) == "mowing"
    assert live_state("mowing", now - timedelta(minutes=11), now) == "offline"
    assert live_state("off", now, now) == "offline"
    assert live_state(None, None, now) == "offline"


def test_period_range_month_prev_same_span():
    now = datetime(2026, 10, 4, 12, tzinfo=UTC)
    start, prev, prev_end = period_range("month", now)
    assert start == datetime(2026, 10, 1, tzinfo=UTC)
    assert prev == datetime(2026, 9, 1, tzinfo=UTC)
    assert prev_end == datetime(2026, 9, 4, 12, tzinfo=UTC)
    d0, dprev, dprev_end = period_range("day", now)
    assert (d0, dprev, dprev_end) == (datetime(2026, 10, 4, tzinfo=UTC), datetime(2026, 10, 3, tzinfo=UTC), d0)


FACTORS = {
    "grass_kg_per_m2_per_cm": {"value": 0.195, "source": "saha", "is_assumption": True},
    "bag_capacity_kg": {"value": 8, "source": "Varsayım", "is_assumption": True},
    "bag_mass_g": {"value": 30, "source": "Varsayım", "is_assumption": True},
    "ef_ldpe_kg_co2e_per_kg": {"value": 2.1, "source": "DEFRA 2025", "is_assumption": False},
    "truck_capacity_kg": {"value": 900, "source": "Varsayım", "is_assumption": True},
    "trip_km": {"value": 18, "source": "saha", "is_assumption": True},
    "truck_l_per_km": {"value": 0.3, "source": "Varsayım", "is_assumption": True},
    "ef_diesel_kg_co2e_per_l": {"value": 2.57, "source": "DEFRA 2025", "is_assumption": False},
    "ef_landfill_kg_co2e_per_t": {"value": 446, "source": "DEFRA 2025", "is_assumption": False},
}


def test_audit_rows_shape():
    trace = carbon.compute_savings(1000, 80, 40, FACTORS)["trace"]
    rows = audit_rows(trace)
    assert {k for k in rows[0]} == {"item", "formula", "input", "factor", "source", "is_assumption", "result"}
    grass = next(r for r in rows if r["item"] == "Çim kütlesi")
    assert grass["is_assumption"] is True and "[VARSAYIM]" not in grass["source"]
    landfill = next(r for r in rows if r["item"] == "CO₂e bertaraf")
    assert landfill["is_assumption"] is False and landfill["result"].endswith("kgCO₂e")


def test_openapi_matches_web_types():
    from app.main import app
    spec = app.openapi()
    paths = spec["paths"]
    for p in ("/api/v1/auth/login", "/api/v1/me", "/api/v1/machines/live", "/api/v1/machines/{mid}/track",
              "/api/v1/sessions", "/api/v1/sessions/{sid}", "/api/v1/sessions/{sid}/photos",
              "/api/v1/dashboard", "/api/v1/savings", "/api/v1/factors", "/api/v1/devices/{device_id}/cmd"):
        assert p in paths, p
    schemas = spec["components"]["schemas"]
    live = set(schemas["LiveMachine"]["properties"])
    assert {"machine_id", "name", "device_id", "customer_id", "state", "lat", "lon", "fix", "hacc", "sats",
            "h_pre", "h_post", "bat", "bat_pct", "rssi", "last_seen", "session_started_at", "today_area_m2",
            "operator_name", "site_name"} <= live
    dash = set(schemas["DashboardOut"]["properties"])
    assert {"area_m2", "area_change_pct", "grass_kg", "bags", "co2_total_kg", "machines_active",
            "machines_total", "machines_silent", "daily", "machines", "alerts"} <= dash
    sav = set(schemas["SavingsReportOut"]["properties"])
    assert {"totals", "monthly", "by_site", "audit", "area_m2", "h_cut_avg_cm"} <= sav
    assert {"token", "user"} == set(schemas["LoginOut"]["properties"])
    assert "url" in schemas["SessionPhotoOut"]["properties"]
    assert "operator_id" in {p["name"] for p in paths["/api/v1/sessions"]["get"]["parameters"]}
    assert "customer_id" in {p["name"] for p in paths["/api/v1/machines/live"]["get"]["parameters"]}
