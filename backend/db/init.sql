-- GRIN Takip veritabanı (PostgreSQL 16 + PostGIS + TimescaleDB)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE customers (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  city          TEXT,
  contract_start DATE,
  contract_end   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  customer_id   INT REFERENCES customers(id) ON DELETE CASCADE,  -- NULL = Arteverte admin
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','manager','operator')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sites (
  id            SERIAL PRIMARY KEY,
  customer_id   INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  polygon       GEOGRAPHY(POLYGON, 4326),
  grass_area_m2 NUMERIC,
  notes         TEXT
);
CREATE INDEX sites_polygon_gix ON sites USING GIST (polygon);

CREATE TABLE machines (
  id                SERIAL PRIMARY KEY,
  customer_id       INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  model             TEXT,
  cut_width_cm      NUMERIC NOT NULL DEFAULT 46,
  device_id         TEXT NOT NULL UNIQUE,
  device_token_hash TEXT NOT NULL,
  assigned_user_id  INT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE telemetry (
  time      TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  geom      GEOGRAPHY(POINT, 4326),
  fix       SMALLINT,
  hacc      REAL,
  spd       REAL,
  hdg       REAL,
  h_pre     SMALLINT,
  h_post    SMALLINT,
  us_pre    SMALLINT,
  us_post   SMALLINT,
  vib       REAL,
  state     TEXT,
  temp      REAL,
  hum       REAL,
  soil      JSONB,
  bat       REAL,
  seq       INT
);
SELECT create_hypertable('telemetry', 'time');
CREATE INDEX telemetry_device_time_idx ON telemetry (device_id, time DESC);
CREATE INDEX telemetry_geom_gix ON telemetry USING GIST (geom);

CREATE TABLE device_status (
  time       TIMESTAMPTZ NOT NULL,
  device_id  TEXT NOT NULL,
  bat        REAL,
  rssi       SMALLINT,
  fw         TEXT,
  sd_free_mb INT,
  ntrip      BOOLEAN,
  sats       SMALLINT
);
SELECT create_hypertable('device_status', 'time');
CREATE INDEX device_status_device_time_idx ON device_status (device_id, time DESC);

CREATE TABLE sessions (
  id          SERIAL PRIMARY KEY,
  machine_id  INT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  operator_id INT REFERENCES users(id) ON DELETE SET NULL,
  site_id     INT REFERENCES sites(id) ON DELETE SET NULL,
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ,
  area_m2     NUMERIC,
  overlap_m2  NUMERIC,
  dist_m      NUMERIC,
  h_pre_avg   NUMERIC,
  h_post_avg  NUMERIC,
  fix_ratio   NUMERIC,
  track       GEOGRAPHY(LINESTRING, 4326),
  swath       GEOGRAPHY(MULTIPOLYGON, 4326),
  note        TEXT,
  photos      JSONB NOT NULL DEFAULT '[]'::jsonb,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);
CREATE INDEX sessions_machine_idx ON sessions (machine_id, started_at DESC);

CREATE TABLE savings (
  session_id        INT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  grass_kg          NUMERIC,
  bags              NUMERIC,
  trips             NUMERIC,
  diesel_l          NUMERIC,
  co2_disposal_kg   NUMERIC,
  co2_transport_kg  NUMERIC,
  co2_bags_kg       NUMERIC,
  co2_total_kg      NUMERIC,
  factors_version   TEXT,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE factors (
  key           TEXT PRIMARY KEY,
  value         NUMERIC NOT NULL,
  unit          TEXT NOT NULL,
  source        TEXT NOT NULL,
  is_assumption BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO factors (key, value, unit, source, is_assumption) VALUES
 ('grass_kg_per_m2_per_cm',   0.195, 'kg/(m2·cm)',   'Saha kalibrasyonu (turfgrass literatürü ~1.7 kg/m2/yıl taze)', TRUE),
 ('bag_capacity_kg',          8,     'kg/poşet',      'Varsayım',                                   TRUE),
 ('bag_mass_g',               30,    'g/poşet',       'Varsayım (LDPE 80 L poşet)',                 TRUE),
 ('ef_ldpe_kg_co2e_per_kg',   2.1,   'kgCO2e/kg',     'DEFRA 2025, plastik (LDPE) üretim',          FALSE),
 ('truck_capacity_kg',        900,   'kg/sefer',      'Varsayım (pikap/kamyonet)',                  TRUE),
 ('trip_km',                  18,    'km/sefer',      'Saha: en yakın bertaraf tesisine gidiş-dönüş', TRUE),
 ('truck_l_per_km',           0.3,   'L/km',          'Varsayım (dizel kamyonet şehir içi)',        TRUE),
 ('ef_diesel_kg_co2e_per_l',  2.57,  'kgCO2e/L',      'DEFRA 2025, dizel (yakıt yanma)',            FALSE),
 ('ef_landfill_kg_co2e_per_t',446,   'kgCO2e/t',      'DEFRA 2025, karışık belediye atığı depolama', FALSE);

-- Canlı görünüm: makine başına son telemetri
CREATE VIEW machine_last AS
SELECT DISTINCT ON (device_id) device_id, time, geom, fix, hacc, spd, hdg, h_pre, h_post, state, bat, temp, hum
FROM telemetry ORDER BY device_id, time DESC;
