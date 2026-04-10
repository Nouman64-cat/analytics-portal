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
            ("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS thread_id UUID;",
             "Migration successful! 'thread_id' column added to 'interviews' table."),
            ("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS parent_interview_id UUID REFERENCES interviews(id) ON DELETE SET NULL;",
             "Migration successful! 'parent_interview_id' column added to 'interviews' table."),
            ("UPDATE interviews SET thread_id = id WHERE thread_id IS NULL;",
             "Migration successful! Backfilled 'thread_id' for existing interviews."),
            ("ALTER TABLE interviews ALTER COLUMN thread_id SET NOT NULL;",
             "Migration successful! 'thread_id' NOT NULL enforced."),
            ("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email VARCHAR(255);",
             "Migration successful! 'email' column added to 'candidates' table."),
            ("CREATE INDEX IF NOT EXISTS ix_candidates_email ON candidates (email);",
             "Migration successful! Index on candidates.email ensured."),
            ("""
            CREATE TABLE IF NOT EXISTS interview_reminder_logs (
                id UUID PRIMARY KEY,
                interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
                reminder_type VARCHAR(20) NOT NULL,
                scheduled_for_utc TIMESTAMP NOT NULL,
                sent_at_utc TIMESTAMP NOT NULL
            );
            """,
             "Migration successful! 'interview_reminder_logs' table ensured."),
            ("ALTER TABLE interview_reminder_logs DROP CONSTRAINT IF EXISTS interview_reminder_logs_interview_id_fkey;",
             "Migration successful! Existing FK on interview_reminder_logs dropped (if present)."),
            ("ALTER TABLE interview_reminder_logs ADD CONSTRAINT interview_reminder_logs_interview_id_fkey FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE;",
             "Migration successful! FK with ON DELETE CASCADE ensured for interview reminders."),
            ("CREATE INDEX IF NOT EXISTS ix_interview_reminder_logs_interview_id ON interview_reminder_logs (interview_id);",
             "Migration successful! Index on interview_reminder_logs.interview_id ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_interview_reminder_logs_reminder_type ON interview_reminder_logs (reminder_type);",
             "Migration successful! Index on interview_reminder_logs.reminder_type ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_interview_reminder_logs_scheduled_for_utc ON interview_reminder_logs (scheduled_for_utc);",
             "Migration successful! Index on interview_reminder_logs.scheduled_for_utc ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_interview_reminder_logs_sent_at_utc ON interview_reminder_logs (sent_at_utc);",
             "Migration successful! Index on interview_reminder_logs.sent_at_utc ensured."),
            ("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_interview_reminder_once
            ON interview_reminder_logs (interview_id, reminder_type, scheduled_for_utc);
            """,
             "Migration successful! Unique de-dup index for reminders ensured."),
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
