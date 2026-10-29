import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _load_env_file() -> None:
    """Minimal .env loader so the app runs without extra dependencies."""
    env = BACKEND_DIR / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'student_db.sqlite3'}")
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(24 * 60)))
# Registering as faculty requires this code, so students cannot make themselves faculty.
FACULTY_SIGNUP_CODE = os.getenv("FACULTY_SIGNUP_CODE", "GLBAJAJ-FACULTY")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")]
