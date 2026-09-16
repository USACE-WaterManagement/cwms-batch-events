from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker

from cwms_batch_events.core.settings import DatabaseSettings, get_settings

settings = get_settings(DatabaseSettings)

db_url = URL.create(
    drivername="postgresql+psycopg2",
    username=settings.pguser,
    password=settings.pgpassword,
    database=settings.pgdatabase,
    host=settings.pghost,
    port=settings.pgport,
)

engine = create_engine(db_url)

SessionLocal = sessionmaker(engine)


def create_session():
    return SessionLocal()
