import re

from sqlalchemy import event
from sqlmodel import SQLModel, Session, create_engine
from app.config import get_settings

settings = get_settings()

# Unqualified SQL (SQLModel tables) resolves to the first schema in search_path that has the object.
# Do NOT append ",public" for alternate schemas: if e.g. moeed has no tables yet, PostgreSQL would
# silently use public.users / public.interviews — login and data still come from public.
# Use only the target schema so missing tables error until DDL exists there.
_schema = (settings.DATABASE_SCHEMA or "public").strip()
if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", _schema):
    raise ValueError(
        f"DATABASE_SCHEMA must be a simple PostgreSQL identifier, got: {_schema!r}"
    )

# libpq: space after -c is conventional; some clients ignore -csearch_path=... without it.
_connect_args: dict = {"options": f"-c search_path={_schema}"}

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args=_connect_args,
)


@event.listens_for(engine, "connect")
def _set_search_path(dbapi_connection, _connection_record) -> None:
    """Ensure search_path is set (CREATE TYPE / ENUM needs a selected schema)."""
    cursor = dbapi_connection.cursor()
    # _schema validated as a single PG identifier above
    cursor.execute(f'SET search_path TO "{_schema}"')
    cursor.close()


def create_db_and_tables():
    """Create all tables defined by SQLModel metadata."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session
