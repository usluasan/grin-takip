from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import can_see_machine, get_current_user
from ..db import get_db
from ..models import Machine, User
from ..mqtt_client import publish_cmd

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("/{device_id}/cmd", response_model=schemas.CmdOut)
def send_cmd(device_id: str, body: schemas.CmdIn, db: Session = Depends(get_db),
             user: User = Depends(get_current_user)):
    """admin/manager: kapsamındaki tüm cihazlar; operator: yalnız atandığı makine (örn. mola → interval)."""
    m = db.query(Machine).filter(Machine.device_id == device_id).first()
    if not m or not can_see_machine(user, m):
        raise HTTPException(404, "Cihaz bulunamadı")
    payload = {"cmd": body.cmd}
    if body.cmd == "ota":
        if not body.url:
            raise HTTPException(400, "ota için url gerekli")
        payload["url"] = body.url
    if body.cmd == "interval":
        if body.sec is None:
            raise HTTPException(400, "interval için sec gerekli")
        payload["sec"] = body.sec
    try:
        publish_cmd(device_id, payload)
    except Exception as e:
        raise HTTPException(502, f"MQTT yayını başarısız: {e}")
    return {"ok": True, "topic": f"grin/{device_id}/cmd", "payload": payload}
