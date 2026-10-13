import base64

from app.mosquitto_passwd import hash_mosquitto, read_passwd, set_user, verify_mosquitto


def test_format_and_verify(tmp_path):
    h = hash_mosquitto("secret")
    parts = h.split("$")
    assert parts[1] == "7" and parts[2] == "101"
    assert len(base64.b64decode(parts[3])) == 12 and len(base64.b64decode(parts[4])) == 64
    assert verify_mosquitto("secret", h) and not verify_mosquitto("wrong", h)

    p = tmp_path / "passwd"
    set_user(str(p), "GRIN-01", "tok1")
    set_user(str(p), "grin-api", "tok2")
    set_user(str(p), "GRIN-01", "tok3")
    users = read_passwd(str(p))
    assert set(users) == {"GRIN-01", "grin-api"}
    assert verify_mosquitto("tok3", users["GRIN-01"])
