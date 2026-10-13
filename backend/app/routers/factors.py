from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import get_current_user, require_roles
from ..db import get_db
from ..models import Factor, User

router = APIRouter(prefix="/factors", tags=["factors"])


@router.get("", response_model=list[schemas.FactorOut])
def list_factors(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    # Okuma herkese açık (denetim izi için); yazma sadece admin
    return db.query(Factor).order_by(Factor.key).all()


@router.put("", response_model=list[schemas.FactorOut])
def put_factors(body: list[schemas.FactorIn], db: Session = Depends(get_db),
                _: User = Depends(require_roles("admin"))):
    now = datetime.now(timezone.utc)
    for item in body:
        f = db.get(Factor, item.key) or Factor(key=item.key)
        f.value = item.value
        f.unit = item.unit
        f.source = item.source
        f.is_assumption = item.is_assumption
        f.updated_at = now
        db.add(f)
    db.commit()
    return db.query(Factor).order_by(Factor.key).all()
