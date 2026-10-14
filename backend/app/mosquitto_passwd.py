"""Mosquitto password_file üretimi — mosquitto_passwd uyumlu $7$ (PBKDF2-SHA512) biçimi.

Satır: user:$7$<iter>$<salt_b64>$<hash_b64>
Mosquitto 2.x varsayılanı: iter=101, salt 12 bayt, dklen=64 (SHA512).
Not: Mosquitto dosyayı yalnızca başlangıçta ve SIGHUP ile okur →
  docker compose kill -s HUP mqtt
"""
import base64
import hashlib
import os
import secrets
import tempfile
from typing import Dict

ITERATIONS = 101
# Dosya sahibi "uid:gid" — mosquitto imajındaki kullanıcı (docker run --rm --entrypoint id eclipse-mosquitto:2 mosquitto)
PASSWD_OWNER = os.environ.get("MQTT_PASSWD_OWNER", "1883:1883")
SALT_LEN = 12


def hash_mosquitto(password: str, salt: bytes | None = None, iterations: int = ITERATIONS) -> str:
    salt = salt or secrets.token_bytes(SALT_LEN)
    dk = hashlib.pbkdf2_hmac("sha512", password.encode(), salt, iterations, dklen=64)
    return f"$7${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_mosquitto(password: str, entry: str) -> bool:
    try:
        _, algo, iters, salt_b64, hash_b64 = entry.split("$")
        if algo != "7":
            return False
        salt = base64.b64decode(salt_b64)
        dk = hashlib.pbkdf2_hmac("sha512", password.encode(), salt, int(iters), dklen=64)
        return base64.b64encode(dk).decode() == hash_b64
    except Exception:
        return False


def read_passwd(path: str) -> Dict[str, str]:
    users: Dict[str, str] = {}
    if not os.path.exists(path):
        return users
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or ":" not in line:
                continue
            u, h = line.split(":", 1)
            users[u] = h
    return users


def write_passwd(path: str, users: Dict[str, str]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path) or ".", prefix=".passwd.")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        for u, h in users.items():
            f.write(f"{u}:{h}\n")
    os.chmod(tmp, 0o600)
    # Mosquitto kendi kullanıcısıyla çalışır (eclipse-mosquitto:2 → 1883:1883); dosya root'un
    # kalırsa broker açamaz. API konteyneri root olduğu için okumaya devam eder.
    # Root olmayan ortamda (yerel test) sahiplik değiştirilemez → atlanır.
    uid, gid = (int(x) for x in PASSWD_OWNER.split(":"))
    try:
        os.chown(tmp, uid, gid)
    except PermissionError:
        pass
    os.replace(tmp, path)


def set_user(path: str, username: str, password: str) -> None:
    users = read_passwd(path)
    users[username] = hash_mosquitto(password)
    write_passwd(path, users)


def remove_user(path: str, username: str) -> None:
    users = read_passwd(path)
    if username in users:
        del users[username]
        write_passwd(path, users)
