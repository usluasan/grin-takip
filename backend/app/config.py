from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg://grin:grin_dev_pass@localhost:5432/grin"
    MQTT_HOST: str = "localhost"
    MQTT_PORT: int = 1883
    MQTT_ADMIN_USER: str = "grin-api"
    MQTT_ADMIN_PASSWORD: str = "grin_api_pass"
    MQTT_PASSWD_FILE: str = "/mosquitto/passwd/passwd"
    JWT_SECRET: str = "change-me-in-production"
    JWT_EXPIRE_HOURS: int = 8
    ADMIN_EMAIL: str = "admin@arteverte.com"
    ADMIN_PASSWORD: str = "admin123"
    SEED_DEMO: str = "0"
    UPLOAD_DIR: str = "/data/uploads"
    CORS_ORIGINS: str = "*"
    SESSION_IDLE_MINUTES: int = 10  # SPEC §7

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
