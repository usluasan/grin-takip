import math

import pytest

from app.carbon import compute_savings, factors_version

FACTORS = {
    "grass_kg_per_m2_per_cm": {"value": 0.195, "unit": "kg/(m2·cm)", "source": "saha", "is_assumption": True},
    "bag_capacity_kg": {"value": 8, "unit": "kg", "source": "varsayım", "is_assumption": True},
    "bag_mass_g": {"value": 30, "unit": "g", "source": "varsayım", "is_assumption": True},
    "ef_ldpe_kg_co2e_per_kg": {"value": 2.1, "unit": "kgCO2e/kg", "source": "DEFRA 2025", "is_assumption": False},
    "truck_capacity_kg": {"value": 900, "unit": "kg", "source": "varsayım", "is_assumption": True},
    "trip_km": {"value": 18, "unit": "km", "source": "saha", "is_assumption": True},
    "truck_l_per_km": {"value": 0.3, "unit": "L/km", "source": "varsayım", "is_assumption": True},
    "ef_diesel_kg_co2e_per_l": {"value": 2.57, "unit": "kgCO2e/L", "source": "DEFRA 2025", "is_assumption": False},
    "ef_landfill_kg_co2e_per_t": {"value": 446, "unit": "kgCO2e/t", "source": "DEFRA 2025", "is_assumption": False},
}


def test_hand_computed_example():
    # 1000 m², 81 mm → 40 mm = 4.1 cm kesim
    r = compute_savings(1000, 81, 40, FACTORS)
    grass = 1000 * 4.1 * 0.195            # 799.5 kg
    assert math.isclose(r["grass_kg"], grass, rel_tol=1e-9)
    assert math.isclose(r["bags"], grass / 8, rel_tol=1e-9)                 # 99.9375
    assert math.isclose(r["trips"], grass / 900, rel_tol=1e-9)              # 0.8883
    diesel = grass / 900 * 18 * 0.3                                          # 4.797 L
    assert math.isclose(r["diesel_l"], diesel, rel_tol=1e-9)
    assert math.isclose(r["co2_bags_kg"], grass / 8 * 0.030 * 2.1, rel_tol=1e-9)        # 6.296
    assert math.isclose(r["co2_transport_kg"], diesel * 2.57, rel_tol=1e-9)             # 12.328
    assert math.isclose(r["co2_disposal_kg"], grass / 1000 * 446, rel_tol=1e-9)         # 356.577
    assert math.isclose(r["co2_total_kg"], 6.2960625 + 12.32829 + 356.577, rel_tol=1e-6)
    assert len(r["trace"]) == 9
    assert all({"kalem", "formül", "girdi", "katsayı", "kaynak", "sonuç"} <= set(t) for t in r["trace"])
    assert "[VARSAYIM]" in r["trace"][1]["kaynak"]


def test_negative_cut_clamped_to_zero():
    r = compute_savings(500, 30, 45, FACTORS)
    assert r["grass_kg"] == 0 and r["co2_total_kg"] == 0


def test_missing_heights():
    r = compute_savings(500, None, None, FACTORS)
    assert r["grass_kg"] == 0


def test_missing_factor_raises():
    f = dict(FACTORS)
    del f["trip_km"]
    with pytest.raises(ValueError):
        compute_savings(1, 1, 0, f)


def test_version_changes_with_values():
    f2 = {**FACTORS, "trip_km": {**FACTORS["trip_km"], "value": 20}}
    assert factors_version(FACTORS) != factors_version(f2)
