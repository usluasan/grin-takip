"""SQLAlchemy 2 modelleri — init.sql ile birebir (şema init.sql tarafından oluşturulur)."""
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean, Date, ForeignKey, Integer, Numeric, REAL, SmallInteger, Text, text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

TS = TIMESTAMP(timezone=True)


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[Optional[str]] = mapped_column(Text)
    contract_start: Mapped[Optional[date]] = mapped_column(Date)
    contract_end: Mapped[Optional[date]] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=text("now()"))


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"))
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)  # admin|manager|operator
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=text("now()"))


class Site(Base):
    __tablename__ = "sites"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    polygon = mapped_column(Geography("POLYGON", srid=4326))
    grass_area_m2: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class Machine(Base):
    __tablename__ = "machines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[Optional[str]] = mapped_column(Text)
    cut_width_cm: Mapped[Decimal] = mapped_column(Numeric, nullable=False, default=Decimal(46))
    device_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    device_token_hash: Mapped[str] = mapped_column(Text, nullable=False)
    assigned_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(TS, server_default=text("now()"))


class Telemetry(Base):
    __tablename__ = "telemetry"
    # Hypertable; PK yok → ORM için bileşik anahtar tanımlıyoruz (sadece eşleme amaçlı)
    time: Mapped[datetime] = mapped_column(TS, primary_key=True)
    device_id: Mapped[str] = mapped_column(Text, primary_key=True)
    geom = mapped_column(Geography("POINT", srid=4326))
    fix: Mapped[Optional[int]] = mapped_column(SmallInteger)
    hacc: Mapped[Optional[float]] = mapped_column(REAL)
    spd: Mapped[Optional[float]] = mapped_column(REAL)
    hdg: Mapped[Optional[float]] = mapped_column(REAL)
    h_pre: Mapped[Optional[int]] = mapped_column(SmallInteger)
    h_post: Mapped[Optional[int]] = mapped_column(SmallInteger)
    us_pre: Mapped[Optional[int]] = mapped_column(SmallInteger)
    us_post: Mapped[Optional[int]] = mapped_column(SmallInteger)
    vib: Mapped[Optional[float]] = mapped_column(REAL)
    state: Mapped[Optional[str]] = mapped_column(Text)
    temp: Mapped[Optional[float]] = mapped_column(REAL)
    hum: Mapped[Optional[float]] = mapped_column(REAL)
    soil: Mapped[Optional[Any]] = mapped_column(JSONB)
    bat: Mapped[Optional[float]] = mapped_column(REAL)
    seq: Mapped[Optional[int]] = mapped_column(Integer)


class DeviceStatus(Base):
    __tablename__ = "device_status"
    time: Mapped[datetime] = mapped_column(TS, primary_key=True)
    device_id: Mapped[str] = mapped_column(Text, primary_key=True)
    bat: Mapped[Optional[float]] = mapped_column(REAL)
    rssi: Mapped[Optional[int]] = mapped_column(SmallInteger)
    fw: Mapped[Optional[str]] = mapped_column(Text)
    sd_free_mb: Mapped[Optional[int]] = mapped_column(Integer)
    ntrip: Mapped[Optional[bool]] = mapped_column(Boolean)
    sats: Mapped[Optional[int]] = mapped_column(SmallInteger)


class MowSession(Base):
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    machine_id: Mapped[int] = mapped_column(ForeignKey("machines.id", ondelete="CASCADE"), nullable=False)
    operator_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id", ondelete="SET NULL"))
    started_at: Mapped[datetime] = mapped_column(TS, nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(TS)
    area_m2: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    overlap_m2: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    dist_m: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    h_pre_avg: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    h_post_avg: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    fix_ratio: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    track = mapped_column(Geography("LINESTRING", srid=4326))
    swath = mapped_column(Geography("MULTIPOLYGON", srid=4326))
    note: Mapped[Optional[str]] = mapped_column(Text)
    photos: Mapped[Any] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="open")


class Saving(Base):
    __tablename__ = "savings"
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True)
    grass_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    bags: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    trips: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    diesel_l: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    co2_disposal_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    co2_transport_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    co2_bags_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    co2_total_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    factors_version: Mapped[Optional[str]] = mapped_column(Text)
    computed_at: Mapped[datetime] = mapped_column(TS, server_default=text("now()"))


class Factor(Base):
    __tablename__ = "factors"
    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    unit: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    is_assumption: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(TS, server_default=text("now()"))
