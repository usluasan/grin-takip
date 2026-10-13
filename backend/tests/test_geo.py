import math

from shapely import wkt

from app.geo import compute_area, is_good

LAT0, LON0 = 39.86, 32.86
M_PER_DEG_LAT = 111_320.0


def straight_track(n_m: int, lat=LAT0, lon=LON0, fix=4, h_pre=81, h_post=40):
    # Kuzeye doğru 1 m aralıklı noktalar
    return [{"lat": lat + i / M_PER_DEG_LAT, "lon": lon, "fix": fix, "hacc": 0.02,
             "h_pre": h_pre, "h_post": h_post, "us_pre": 83, "us_post": 41}
            for i in range(n_m + 1)]


def test_straight_100m_46cm():
    r = compute_area(straight_track(100), 46)
    assert math.isclose(r["dist_m"], 100, rel_tol=0.01)
    assert math.isclose(r["area_m2"], 46, rel_tol=0.02)
    assert r["overlap_m2"] < 0.5
    assert r["fix_ratio"] == 1.0
    assert r["h_pre_avg"] == 81 and r["h_post_avg"] == 40
    g = wkt.loads(r["swath_wkt"])
    assert g.geom_type == "MultiPolygon"
    assert wkt.loads(r["track_wkt"]).geom_type == "LineString"


def test_two_overlapping_passes():
    # İkinci geçiş 20 cm yana kaymış → 26 cm örtüşme × 100 m ≈ 26 m²
    first = straight_track(100)
    second = [dict(p, lon=LON0 + 0.20 / (M_PER_DEG_LAT * math.cos(math.radians(LAT0)))) for p in reversed(first)]
    pts = first + second
    r = compute_area(pts, 46)
    assert r["overlap_m2"] > 20
    assert math.isclose(r["area_m2"], 66, rel_tol=0.05)   # 0.66 m × 100 m


def test_bad_fix_filtered_and_fallback_to_ultrasonic():
    pts = straight_track(10, fix=1, h_pre=-1, h_post=-1)
    for p in pts:
        p["hacc"] = 3.0
    r = compute_area(pts, 46)
    assert r["area_m2"] == 0 and r["fix_ratio"] == 0
    assert r["h_pre_avg"] == 83 and r["h_post_avg"] == 41  # us_* fallback
    assert not is_good({"fix": 1, "hacc": 2}) and is_good({"fix": 1, "hacc": 0.3})
