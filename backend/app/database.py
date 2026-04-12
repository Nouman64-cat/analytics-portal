from urllib.parse import quote_plus

from sqlmodel import SQLModel, Session, create_engine
from app.config import get_settings

settings = get_settings()

# Unqualified SQL (SQLModel tables) resolves to the first schema in search_path that has the object.
# Do NOT append ",public" for alternate schemas: if e.g. moeed has no tables yet, PostgreSQL would
# silently use public.users / public.interviews — login and data still come from public.
# Use only the target schema so missing tables error until DDL exists there.
_connect_args: dict = {}
_schema = (settings.DATABASE_SCHEMA or "public").strip()
if _schema:
    _connect_args["options"] = f"-csearch_path={quote_plus(_schema)}"

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args=_connect_args,
)


def create_db_and_tables():
    """Create all tables defined by SQLModel metadata."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session
