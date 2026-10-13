from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import check_customer_scope, get_current_user, hash_password, require_roles
from ..common import user_out, users_out
from ..db import get_db
from ..models import Machine, User
from .customers import get_customer_or_404

router = APIRouter(prefix="/customers/{cid}/users", tags=["users"])


@router.get("", response_model=list[schemas.UserOut])
def list_users(cid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    check_customer_scope(user, cid)
    return users_out(db, db.query(User).filter(User.customer_id == cid).order_by(User.id).all())


@router.post("", response_model=schemas.UserOut, status_code=201)
def create_user(cid: int, body: schemas.UserIn, db: Session = Depends(get_db),
                user: User = Depends(require_roles("admin", "manager"))):
    """Kullanıcı oluşturur (davet e-postası yok; geçici şifre zorunlu). assigned_machine_id verilirse makineye atar."""
    check_customer_scope(user, cid)
    get_customer_or_404(db, cid)
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "Bu e-posta zaten kayıtlı")
    machine = None
    if body.assigned_machine_id is not None:
        machine = db.get(Machine, body.assigned_machine_id)
        if not machine or machine.customer_id != cid:
            raise HTTPException(400, "Atanacak makine bu müşteriye ait değil")
    u = User(customer_id=cid, email=email, password_hash=hash_password(body.password),
             full_name=body.full_name, role=body.role, is_active=True)
    db.add(u)
    db.flush()
    if machine is not None and body.role == "operator":
        machine.assigned_user_id = u.id
    db.commit()
    return user_out(db, u)
