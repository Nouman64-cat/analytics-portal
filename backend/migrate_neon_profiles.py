import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

engine = create_engine(os.getenv("DATABASE_URL"))

with engine.connect() as conn:
    print("Executing ALTER TABLE to add is_active column...")
    try:
        conn.execute(text("ALTER TABLE resume_profiles ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;"))
        conn.commit()
        print("Success!")
    except Exception as e:
        print("Error or already exists:", e)
        conn.rollback()
