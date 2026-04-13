import re

from sqlalchemy import event, text
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
    """Ensure search_path is set for every pooled connection."""
    cursor = dbapi_connection.cursor()
    cursor.execute(f"SET search_path TO {_schema}")
    cursor.close()


def create_db_and_tables():
    """Create all tables in DATABASE_SCHEMA (search_path must apply to DDL)."""
    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        conn.execute(text(f"SET search_path TO {_schema}"))
        SQLModel.metadata.create_all(bind=conn)


def get_session():
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session
