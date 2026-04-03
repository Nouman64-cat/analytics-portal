import sys
import os

from sqlmodel import Session, text
from app.database import engine


def migrate():
    with Session(engine) as session:
        migrations = [
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR NOT NULL DEFAULT 'team-member';",
             "Migration successful! 'role' column added to 'users' table."),
            ("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS interviewer VARCHAR(255);",
             "Migration successful! 'interviewer' column added to 'interviews' table."),
            ("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS interview_link VARCHAR(1000);",
             "Migration successful! 'interview_link' column added to 'interviews' table."),
            ("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS is_phone_call BOOLEAN NOT NULL DEFAULT FALSE;",
             "Migration successful! 'is_phone_call' column added to 'interviews' table."),
            ("ALTER TABLE companies ADD COLUMN IF NOT EXISTS detail TEXT;",
             "Migration successful! 'detail' column added to 'companies' table."),
            ("ALTER TABLE resume_profiles ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);",
             "Migration successful! 'linkedin_url' column added to 'resume_profiles' table."),
            ("ALTER TABLE resume_profiles ADD COLUMN IF NOT EXISTS github_url VARCHAR(500);",
             "Migration successful! 'github_url' column added to 'resume_profiles' table."),
            ("ALTER TABLE resume_profiles ADD COLUMN IF NOT EXISTS portfolio_url VARCHAR(1000);",
             "Migration successful! 'portfolio_url' column added to 'resume_profiles' table."),
            ("ALTER TABLE resume_profiles ADD COLUMN IF NOT EXISTS resume_url VARCHAR(1000);",
             "Migration successful! 'resume_url' column added to 'resume_profiles' table."),
            ("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS interview_doc_url VARCHAR(1000);",
             "Migration successful! 'interview_doc_url' column added to 'interviews' table."),
            ("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS recruiter_feedback TEXT;",
             "Migration successful! 'recruiter_feedback' column added to 'interviews' table."),
        ]
        for sql, msg in migrations:
            try:
                session.exec(text(sql))
                session.commit()
                print(msg)
            except Exception as e:
                session.rollback()
                print(f"Migration failed: {e}")


if __name__ == '__main__':
    migrate()
