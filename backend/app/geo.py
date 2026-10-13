"""Alan hesabı — SPEC §4. Veritabanından bağımsız; nokta listesi alır.

Nokta: dict {lon, lat, fix, hacc, h_pre, h_post, us_pre, us_post} (ts sırasına göre).
"""
import math
from typing import Iterable, Mapping, Optional

from pyproj import CRS, Transformer
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.ops import transform, unary_union

GOOD_FIX = 4
GOOD_HACC = 0.5


def is_good(p: Mapping) -> bool:
    fix = p.get("fix")
    hacc = p.get("hacc")
    if fix is not None and fix >= GOOD_FIX:
        return True
    return hacc is not None and hacc <= GOOD_HACC


def utm_crs_for(lon: float, lat: float) -> CRS:
    zone = int(math.floor((lon + 180) / 6) + 1)
    epsg = (32600 if lat >= 0 else 32700) + zone
    return CRS.from_epsg(epsg)


def _avg(values: Iterable[Optional[float]]) -> Optional[float]:
    vals = [float(v) for v in values if v is not None and v >= 0]
    return sum(vals) / len(vals) if vals else None


def compute_area(points: list[Mapping], cut_width_cm: float) -> dict:
    """Döner: area_m2, overlap_m2, dist_m, fix_ratio, h_pre_avg, h_post_avg, track_wkt, swath_wkt."""
    n_total = len(points)
    good = [p for p in points if is_good(p) and p.get("lon") is not None and p.get("lat") is not None]
    fix_ratio = (len(good) / n_total) if n_total else 0.0

    # Çim boyu: ToF (h_*) tercih, yoksa ultrasonik (us_*); -1 = ölçüm yok
    h_pre = _avg(p.get("h_pre") for p in points)
    h_post = _avg(p.get("h_post") for p in points)
    if h_pre is None:
        h_pre = _avg(p.get("us_pre") for p in points)
    if h_post is None:
        h_post = _avg(p.get("us_post") for p in points)

    result = {
        "area_m2": 0.0, "overlap_m2": 0.0, "dist_m": 0.0, "fix_ratio": fix_ratio,
        "h_pre_avg": h_pre, "h_post_avg": h_post, "track_wkt": None, "swath_wkt": None,
        "n_points": n_total, "n_good": len(good),
    }
    if len(good) < 2:
        return result

    # Ardışık tekrar noktaları at
    coords = []
    for p in good:
        c = (float(p["lon"]), float(p["lat"]))
        if not coords or coords[-1] != c:
            coords.append(c)
    if len(coords) < 2:
        return result

    utm = utm_crs_for(*coords[0])
    fwd = Transformer.from_crs(4326, utm, always_xy=True).transform
    inv = Transformer.from_crs(utm, 4326, always_xy=True).transform

    line_ll = LineString(coords)
    line_m = transform(fwd, line_ll)
    half = float(cut_width_cm) / 100.0 / 2.0

    xy = list(line_m.coords)
    seg_buffers = []
    for a, b in zip(xy[:-1], xy[1:]):
        seg = LineString([a, b])
        if seg.length == 0:
            continue
        seg_buffers.append(seg.buffer(half, cap_style="flat"))
    if not seg_buffers:
        return result

    union = unary_union(seg_buffers)
    sum_area = sum(b.area for b in seg_buffers)
    if isinstance(union, Polygon):
        union = MultiPolygon([union])
    elif union.geom_type == "GeometryCollection":
        polys = [g for g in union.geoms if isinstance(g, Polygon)]
        union = MultiPolygon(polys)

    result.update({
        "area_m2": union.area,
        "overlap_m2": max(0.0, sum_area - union.area),
        "dist_m": line_m.length,
        "track_wkt": line_ll.wkt,
        "swath_wkt": transform(inv, union).wkt,
    })
    return result
