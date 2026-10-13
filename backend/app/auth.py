"""Kimlik: bcrypt + JWT (8 saat). Rol ve müşteri kapsamı denetimleri."""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Machine, MowSession, User

bearer = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


def new_device_token() -> str:
    return secrets.token_urlsafe(24)


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "cid": user.customer_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.JWT_EXPIRE_HOURS)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Geçersiz veya süresi dolmuş token")


def user_from_token(token: str, db: Session) -> User:
    payload = decode_token(token)
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Kullanıcı bulunamadı veya pasif")
    return user


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    token_q: Optional[str] = Query(None, alias="token"),
    db: Session = Depends(get_db),
) -> User:
    token = creds.credentials if creds else token_q
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Kimlik doğrulama gerekli")
    return user_from_token(token, db)


def require_roles(*roles: str):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu işlem için yetkiniz yok")
        return user
    return dep


def check_customer_scope(user: User, customer_id: int) -> None:
    """admin her müşteriyi görür; manager/operator sadece kendi müşterisini."""
    if user.role == "admin":
        return
    if user.customer_id != customer_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu müşteriye erişim yetkiniz yok")


def effective_customer_id(user: User, requested: Optional[int]) -> Optional[int]:
    """Sorgu parametresindeki customer_id'yi kullanıcının kapsamına indirger."""
    if user.role == "admin":
        return requested
    if requested is not None and requested != user.customer_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu müşteriye erişim yetkiniz yok")
    return user.customer_id


def can_see_machine(user: User, m: Machine) -> bool:
    if user.role == "admin":
        return True
    if m.customer_id != user.customer_id:
        return False
    if user.role == "operator":
        return m.assigned_user_id == user.id
    return True


def can_see_session(user: User, s: MowSession, m: Machine) -> bool:
    if user.role == "admin":
        return True
    if m.customer_id != user.customer_id:
        return False
    if user.role == "operator":
        return s.operator_id == user.id or m.assigned_user_id == user.id
    return True
