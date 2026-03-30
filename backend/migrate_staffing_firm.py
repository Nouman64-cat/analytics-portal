import sys
import os
from sqlmodel import Session, create_engine, text
from app.config import get_settings

engine = create_engine(get_settings().DATABASE_URL)

try:
    with Session(engine) as session:
        # Check if the column exists to avoid errors on re-run
        res = session.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='companies' AND column_name='staffing_firm'")).fetchone()
        if res:
            print("Migrating staffing_firm to is_staffing_firm (boolean)")
            session.execute(text("ALTER TABLE companies ADD COLUMN is_staffing_firm BOOLEAN DEFAULT FALSE;"))
            session.execute(text("UPDATE companies SET is_staffing_firm = TRUE WHERE staffing_firm IS NOT NULL AND staffing_firm != '';"))
            session.execute(text("ALTER TABLE companies DROP COLUMN staffing_firm;"))
            session.commit()
            print("Migration successful.")
        else:
            print("Column staffing_firm already missing or migrated.")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
