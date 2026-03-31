import sys
import os

from sqlmodel import Session, text
from app.database import engine

def migrate():
    with Session(engine) as session:
        # Use simple text to execute the migration
        try:
            session.exec(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR NOT NULL DEFAULT 'team-member';"))
            session.commit()
            print("Migration successful! 'role' column added to 'users' table.")
        except Exception as e:
            session.rollback()
            print(f"Migration failed: {e}")

if __name__ == '__main__':
    migrate()
