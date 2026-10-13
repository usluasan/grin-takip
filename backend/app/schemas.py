"""Pydantic şemaları — web/src/types.ts ile birebir (SPEC §6.1)."""
from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


# --- auth / users ---
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    customer_id: Optional[int]
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None
    assigned_machine_id: Optional[int] = None   # operatörün ilk atanmış makinesi
    machine_name: Optional[str] = None
    status: str = "active"                      # active | invited (is_active'ten türetilir)
    model_config = {"from_attributes": True}


class LoginOut(BaseModel):
    token: str
    user: UserOut


class UserIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    role: str = Field(pattern=r"^(manager|operator)$")
    assigned_machine_id: Optional[int] = None


# --- customers ---
class CustomerIn(BaseModel):
    name: str
    city: Optional[str] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None


class CustomerPatch(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None


class CustomerOut(CustomerIn):
    id: int
    created_at: Optional[datetime] = None
    site_count: Optional[int] = None
    machine_count: Optional[int] = None
    user_count: Optional[int] = None
    model_config = {"from_attributes": True}


# --- sites ---
class SiteIn(BaseModel):
    name: str
    polygon: Optional[dict] = Field(None, description="GeoJSON Polygon")
    grass_area_m2: Optional[float] = None
    notes: Optional[str] = None

    @field_validator("polygon")
    @classmethod
    def _poly(cls, v):
        if v is not None and v.get("type") != "Polygon":
            raise ValueError("polygon GeoJSON Polygon olmalı")
        return v


class SiteOut(BaseModel):
    id: int
    customer_id: int
    name: str
    polygon: Optional[dict] = None
    grass_area_m2: float = 0
    notes: Optional[str] = None
    week_pct: Optional[float] = None   # bu hafta biçilen alan / çim alanı (×100)


# --- machines ---
class MachineIn(BaseModel):
    name: str
    model: Optional[str] = None
    cut_width_cm: float = 46
    device_id: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_\-]+$")
    assigned_user_id: Optional[int] = None


class MachinePatch(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    cut_width_cm: Optional[float] = None
    assigned_user_id: Optional[int] = None
    rotate_token: bool = False


class MachineOut(BaseModel):
    id: int
    customer_id: int
    name: str
    model: Optional[str]
    cut_width_cm: float
    device_id: str
    assigned_user_id: Optional[int]
    assigned_user_name: Optional[str] = None
    created_at: Optional[datetime] = None
    state: Optional[str] = None            # mowing|idle|transport|off|offline
    month_area_m2: Optional[float] = None
    bat_pct: Optional[int] = None
    last_seen: Optional[datetime] = None
    model_config = {"from_attributes": True}


class MachineCreated(MachineOut):
    device_token: str  # yalnızca oluşturma anında döner


class MachinePatched(MachineOut):
    device_token: Optional[str] = None  # rotate_token=true ise dolu


class LiveMachine(BaseModel):
    """GET /machines/live — makine başına düz satır (types.ts LiveMachine)."""
    machine_id: int
    name: str
    device_id: str
    customer_id: int
    customer_name: Optional[str] = None
    operator_name: Optional[str] = None
    site_name: Optional[str] = None
    state: str = "offline"
    lat: Optional[float] = None
    lon: Optional[float] = None
    hdg: Optional[float] = None
    spd: Optional[float] = None
    fix: Optional[int] = None
    hacc: Optional[float] = None
    sats: Optional[int] = None
    h_pre: Optional[int] = None
    h_post: Optional[int] = None
    bat: Optional[float] = None
    bat_pct: Optional[int] = None
    rssi: Optional[int] = None
    last_seen: Optional[datetime] = None
    session_started_at: Optional[datetime] = None
    today_area_m2: float = 0


class TrackOut(BaseModel):
    machine_id: int
    from_: datetime = Field(alias="from")
    to: datetime
    track: Optional[dict] = None   # GeoJSON LineString
    swath: Optional[dict] = None   # GeoJSON MultiPolygon
    sessions: list[dict] = []      # [{id, swath, is_today}]
    summary: Optional[dict] = None
    model_config = {"populate_by_name": True}


# --- sessions ---
class SavingsOut(BaseModel):
    session_id: Optional[int] = None
    grass_kg: float = 0
    bags: float = 0
    trips: float = 0
    diesel_l: float = 0
    co2_disposal_kg: float = 0
    co2_transport_kg: float = 0
    co2_bags_kg: float = 0
    co2_total_kg: float = 0
    factors_version: Optional[str] = None
    computed_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    id: int
    machine_id: int
    machine_name: Optional[str] = None
    machine_model: Optional[str] = None
    device_id: Optional[str] = None
    operator_id: Optional[int]
    operator_name: Optional[str] = None
    site_id: Optional[int]
    site_name: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime]
    area_m2: float = 0
    overlap_m2: float = 0
    dist_m: float = 0
    h_pre_avg: Optional[float]
    h_post_avg: Optional[float]
    fix_ratio: Optional[float]
    note: Optional[str]
    photos: list[str] = []
    status: str
    savings: Optional[SavingsOut] = None


class SessionDetail(SessionOut):
    hacc_avg: Optional[float] = None
    temp_avg: Optional[float] = None
    hum_avg: Optional[float] = None
    soil_avg: Optional[float] = None
    track: Optional[dict] = None   # GeoJSON LineString
    swath: Optional[dict] = None   # GeoJSON MultiPolygon
    trace: Optional[list] = None   # karbon hesap izi (ham)


class SessionPhotoOut(SessionDetail):
    url: str


class SessionPatch(BaseModel):
    note: Optional[str] = None
    photos: Optional[list[str]] = None
    site_id: Optional[int] = None


# --- dashboard ---
class DashboardAlert(BaseModel):
    level: str          # warn | ok | info
    title: str
    detail: str


class DashboardMachineRow(BaseModel):
    machine_id: int
    name: str
    state: str
    site_name: Optional[str] = None
    today_area_m2: float = 0
    last_seen: Optional[datetime] = None


class DashboardOut(BaseModel):
    period: str
    from_: datetime = Field(alias="from")
    to: datetime
    customer_id: Optional[int] = None
    area_m2: float
    area_change_pct: Optional[float] = None
    grass_kg: float
    bags: float
    co2_total_kg: float
    sessions: int = 0
    machines_active: int
    machines_total: int
    machines_silent: int
    daily: list[dict]
    machines: list[DashboardMachineRow]
    alerts: list[DashboardAlert]
    model_config = {"populate_by_name": True}


# --- savings ---
class AuditRow(BaseModel):
    item: str
    formula: str
    input: str
    factor: str
    source: str
    is_assumption: bool
    result: str


class SavingsReportOut(BaseModel):
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    from_: Optional[datetime] = Field(None, alias="from")
    to: Optional[datetime] = None
    area_m2: float
    h_cut_avg_cm: Optional[float] = None
    sessions: int = 0
    totals: SavingsOut
    monthly: list[dict]      # [{month:'YYYY-MM', co2_total_kg}]
    by_site: list[dict]      # [{site_id, site_name, co2_total_kg}]
    audit: list[AuditRow]
    season_total_kg: Optional[float] = None
    factors_version: Optional[str] = None
    trace: Optional[list] = None
    model_config = {"populate_by_name": True}


# --- factors ---
class FactorIn(BaseModel):
    key: str
    value: float
    unit: str
    source: str
    is_assumption: bool = False


class FactorOut(FactorIn):
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


# --- devices ---
class CmdIn(BaseModel):
    cmd: str = Field(pattern=r"^(reboot|ota|interval)$")
    url: Optional[str] = None
    sec: Optional[int] = Field(None, ge=1, le=3600)


class CmdOut(BaseModel):
    ok: bool
    topic: str
    payload: dict[str, Any]
