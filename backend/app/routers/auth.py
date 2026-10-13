from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import create_token, get_current_user, verify_password
from ..common import user_out
from ..db import get_db
from ..models import User

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=schemas.LoginOut)
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-posta veya şifre hatalı")
    return {"token": create_token(user), "user": user_out(db, user)}


@router.get("/me", response_model=schemas.UserOut)
def me(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return user_out(db, user)
