from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import check_customer_scope, get_current_user, require_roles
from ..db import get_db
from ..models import Customer, User

router = APIRouter(prefix="/customers", tags=["customers"])


def get_customer_or_404(db: Session, cid: int) -> Customer:
    c = db.get(Customer, cid)
    if not c:
        raise HTTPException(404, "Müşteri bulunamadı")
    return c


def customers_out(db: Session, rows: list[Customer]) -> list[dict]:
    """CustomerOut + site/machine/user sayıları."""
    if not rows:
        return []
    ids = [c.id for c in rows]
    counts = {r["id"]: dict(r) for r in db.execute(text("""
        SELECT c.id,
               (SELECT COUNT(*) FROM sites s WHERE s.customer_id = c.id) AS site_count,
               (SELECT COUNT(*) FROM machines m WHERE m.customer_id = c.id) AS machine_count,
               (SELECT COUNT(*) FROM users u WHERE u.customer_id = c.id) AS user_count
        FROM customers c WHERE c.id = ANY(:ids)
    """), {"ids": ids}).mappings().all()}
    out = []
    for c in rows:
        d = {k: getattr(c, k) for k in ("id", "name", "city", "contract_start", "contract_end", "created_at")}
        n = counts.get(c.id, {})
        d.update(site_count=int(n.get("site_count", 0)), machine_count=int(n.get("machine_count", 0)),
                 user_count=int(n.get("user_count", 0)))
        out.append(d)
    return out


@router.get("", response_model=list[schemas.CustomerOut])
def list_customers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Customer)
    if user.role != "admin":
        q = q.filter(Customer.id == user.customer_id)
    return customers_out(db, q.order_by(Customer.id).all())


@router.post("", response_model=schemas.CustomerOut, status_code=201)
def create_customer(body: schemas.CustomerIn, db: Session = Depends(get_db),
                    _: User = Depends(require_roles("admin"))):
    c = Customer(**body.model_dump())
    db.add(c)
    db.commit()
    return customers_out(db, [c])[0]


@router.get("/{cid}", response_model=schemas.CustomerOut)
def get_customer(cid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    check_customer_scope(user, cid)
    return customers_out(db, [get_customer_or_404(db, cid)])[0]


@router.patch("/{cid}", response_model=schemas.CustomerOut)
def patch_customer(cid: int, body: schemas.CustomerPatch, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("admin", "manager"))):
    check_customer_scope(user, cid)
    c = get_customer_or_404(db, cid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    return customers_out(db, [c])[0]
