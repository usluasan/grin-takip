"""Karbon motoru — SPEC §5 formülleri. Veritabanından bağımsız; factors dict alır.

factors: {key: {"value": float, "unit": str, "source": str, "is_assumption": bool}}
"""
from typing import Any, Mapping

REQUIRED_KEYS = [
    "grass_kg_per_m2_per_cm", "bag_capacity_kg", "bag_mass_g", "ef_ldpe_kg_co2e_per_kg",
    "truck_capacity_kg", "trip_km", "truck_l_per_km", "ef_diesel_kg_co2e_per_l",
    "ef_landfill_kg_co2e_per_t",
]


def _f(factors: Mapping[str, Any], key: str) -> float:
    entry = factors[key]
    return float(entry["value"] if isinstance(entry, Mapping) else entry)


def _src(factors: Mapping[str, Any], key: str) -> str:
    entry = factors[key]
    if isinstance(entry, Mapping):
        s = entry.get("source", "")
        return f"{s} [VARSAYIM]" if entry.get("is_assumption") else s
    return ""


def compute_savings(area_m2: float, h_pre_avg: float | None, h_post_avg: float | None,
                    factors: Mapping[str, Any]) -> dict:
    missing = [k for k in REQUIRED_KEYS if k not in factors]
    if missing:
        raise ValueError(f"Eksik katsayı: {', '.join(missing)}")

    area = max(0.0, float(area_m2 or 0))
    pre = float(h_pre_avg) if h_pre_avg is not None else 0.0
    post = float(h_post_avg) if h_post_avg is not None else 0.0
    cut_cm = max(0.0, (pre - post) / 10.0)

    k_grass = _f(factors, "grass_kg_per_m2_per_cm")
    bag_cap = _f(factors, "bag_capacity_kg")
    bag_g = _f(factors, "bag_mass_g")
    ef_ldpe = _f(factors, "ef_ldpe_kg_co2e_per_kg")
    truck_cap = _f(factors, "truck_capacity_kg")
    trip_km = _f(factors, "trip_km")
    l_per_km = _f(factors, "truck_l_per_km")
    ef_diesel = _f(factors, "ef_diesel_kg_co2e_per_l")
    ef_landfill = _f(factors, "ef_landfill_kg_co2e_per_t")

    grass_kg = area * cut_cm * k_grass
    bags = grass_kg / bag_cap if bag_cap else 0.0
    trips = grass_kg / truck_cap if truck_cap else 0.0
    diesel_l = trips * trip_km * l_per_km
    co2_bags = bags * bag_g / 1000.0 * ef_ldpe
    co2_transport = diesel_l * ef_diesel
    co2_disposal = grass_kg / 1000.0 * ef_landfill
    co2_total = co2_bags + co2_transport + co2_disposal

    def line(kalem, formul, girdi, katsayi, kaynak, sonuc, birim):
        return {"kalem": kalem, "formül": formul, "girdi": girdi, "katsayı": katsayi,
                "kaynak": kaynak, "sonuç": round(sonuc, 6), "birim": birim}

    trace = [
        line("Kesilen boy", "max(0,(h_pre_avg − h_post_avg)/10)",
             {"h_pre_avg_mm": pre, "h_post_avg_mm": post}, None, "ToF ölçümü", cut_cm, "cm"),
        line("Çim kütlesi", "area_m2 × kesilen_cm × grass_kg_per_m2_per_cm",
             {"area_m2": area, "kesilen_cm": cut_cm}, k_grass,
             _src(factors, "grass_kg_per_m2_per_cm"), grass_kg, "kg"),
        line("Poşet sayısı", "grass_kg / bag_capacity_kg", {"grass_kg": grass_kg}, bag_cap,
             _src(factors, "bag_capacity_kg"), bags, "adet"),
        line("Sefer sayısı", "grass_kg / truck_capacity_kg", {"grass_kg": grass_kg}, truck_cap,
             _src(factors, "truck_capacity_kg"), trips, "sefer"),
        line("Dizel", "trips × trip_km × truck_l_per_km", {"trips": trips},
             {"trip_km": trip_km, "truck_l_per_km": l_per_km},
             f"{_src(factors, 'trip_km')}; {_src(factors, 'truck_l_per_km')}", diesel_l, "L"),
        line("CO₂e poşet", "bags × bag_mass_g/1000 × ef_ldpe", {"bags": bags},
             {"bag_mass_g": bag_g, "ef_ldpe": ef_ldpe},
             f"{_src(factors, 'bag_mass_g')}; {_src(factors, 'ef_ldpe_kg_co2e_per_kg')}",
             co2_bags, "kgCO₂e"),
        line("CO₂e taşıma", "diesel_l × ef_diesel", {"diesel_l": diesel_l}, ef_diesel,
             _src(factors, "ef_diesel_kg_co2e_per_l"), co2_transport, "kgCO₂e"),
        line("CO₂e bertaraf", "grass_kg/1000 × ef_landfill", {"grass_kg": grass_kg}, ef_landfill,
             _src(factors, "ef_landfill_kg_co2e_per_t"), co2_disposal, "kgCO₂e"),
        line("CO₂e toplam", "co2_bags + co2_transport + co2_disposal",
             {"co2_bags": co2_bags, "co2_transport": co2_transport, "co2_disposal": co2_disposal},
             None, "—", co2_total, "kgCO₂e"),
    ]
    return {
        "grass_kg": grass_kg, "bags": bags, "trips": trips, "diesel_l": diesel_l,
        "co2_bags_kg": co2_bags, "co2_transport_kg": co2_transport,
        "co2_disposal_kg": co2_disposal, "co2_total_kg": co2_total,
        "cut_cm": cut_cm, "trace": trace,
    }


def factors_version(factors: Mapping[str, Any]) -> str:
    """Denetim izi için katsayı seti imzası (en son updated_at veya değer özeti)."""
    import hashlib
    parts = []
    for k in sorted(factors):
        e = factors[k]
        v = e["value"] if isinstance(e, Mapping) else e
        parts.append(f"{k}={v}")
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:12]
