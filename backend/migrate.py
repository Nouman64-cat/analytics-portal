import sys
import os

from sqlmodel import Session, text
from app.database import engine


def migrate():
    with Session(engine) as session:
        migrations = [
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR NOT NULL DEFAULT 'team-member';",
             "Migration successful! 'role' column added to 'users' table."),
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR NOT NULL DEFAULT 'User';",
             "Migration successful! 'full_name' column added to 'users' table."),
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
            ("""
            CREATE TABLE IF NOT EXISTS activity_logs (
                id UUID PRIMARY KEY,
                actor_user_id UUID NULL,
                actor_email VARCHAR(255) NOT NULL,
                action VARCHAR(100) NOT NULL,
                entity_type VARCHAR(100) NOT NULL,
                entity_id UUID NULL,
                message VARCHAR(500) NOT NULL,
                created_at TIMESTAMP NOT NULL
            );
            """,
             "Migration successful! 'activity_logs' table ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_activity_logs_actor_user_id ON activity_logs (actor_user_id);",
             "Migration successful! Index on activity_logs.actor_user_id ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_activity_logs_actor_email ON activity_logs (actor_email);",
             "Migration successful! Index on activity_logs.actor_email ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_activity_logs_action ON activity_logs (action);",
             "Migration successful! Index on activity_logs.action ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_activity_logs_entity_type ON activity_logs (entity_type);",
             "Migration successful! Index on activity_logs.entity_type ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_activity_logs_entity_id ON activity_logs (entity_id);",
             "Migration successful! Index on activity_logs.entity_id ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_activity_logs_created_at ON activity_logs (created_at);",
             "Migration successful! Index on activity_logs.created_at ensured."),
            ("ALTER TABLE lead_threads ADD COLUMN IF NOT EXISTS is_converted_override BOOLEAN;",
             "Migration successful! 'is_converted_override' column added to 'lead_threads' table."),
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS alarm_enabled BOOLEAN NOT NULL DEFAULT FALSE;",
             "Migration successful! 'alarm_enabled' column added to 'users' table."),
            ("ALTER TABLE business_developers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;",
             "Migration successful! 'is_active' column added to 'business_developers' table."),

            # ── Phase 1: Multi-department support ─────────────────────────────────────
            ("""
            CREATE TABLE IF NOT EXISTS departments (
                id UUID PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                slug VARCHAR(50) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """,
             "Migration successful! 'departments' table ensured."),
            ("CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_name ON departments (name);",
             "Migration successful! Unique index on departments.name ensured."),
            ("CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_slug ON departments (slug);",
             "Migration successful! Unique index on departments.slug ensured."),

            # Add department_id column to all scoped tables (nullable initially)
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID;",
             "Migration successful! 'department_id' column added to 'users'."),
            ("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS department_id UUID;",
             "Migration successful! 'department_id' column added to 'candidates'."),
            ("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS department_id UUID;",
             "Migration successful! 'department_id' column added to 'interviews'."),
            ("ALTER TABLE resume_profiles ADD COLUMN IF NOT EXISTS department_id UUID;",
             "Migration successful! 'department_id' column added to 'resume_profiles'."),

            # Indexes on the new FK columns
            ("CREATE INDEX IF NOT EXISTS ix_users_department_id ON users (department_id);",
             "Migration successful! Index on users.department_id ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_candidates_department_id ON candidates (department_id);",
             "Migration successful! Index on candidates.department_id ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_interviews_department_id ON interviews (department_id);",
             "Migration successful! Index on interviews.department_id ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_resume_profiles_department_id ON resume_profiles (department_id);",
             "Migration successful! Index on resume_profiles.department_id ensured."),

            # Seed the AI department with a stable UUID so backfills are idempotent
            ("""
            INSERT INTO departments (id, name, slug, is_active, created_at)
            VALUES ('00000000-0000-0000-0000-000000000001', 'AI', 'ai', TRUE, NOW())
            ON CONFLICT (id) DO NOTHING;
            """,
             "Migration successful! 'AI' department seeded."),

            # Backfill existing rows → AI department
            ("UPDATE candidates SET department_id = '00000000-0000-0000-0000-000000000001' WHERE department_id IS NULL;",
             "Migration successful! Backfilled candidates with AI department."),
            ("UPDATE interviews SET department_id = '00000000-0000-0000-0000-000000000001' WHERE department_id IS NULL;",
             "Migration successful! Backfilled interviews with AI department."),
            ("UPDATE resume_profiles SET department_id = '00000000-0000-0000-0000-000000000001' WHERE department_id IS NULL;",
             "Migration successful! Backfilled resume_profiles with AI department."),
            # Only team-member users belong to a dept; superadmin/manager/bd stay NULL
            ("""
            UPDATE users SET department_id = '00000000-0000-0000-0000-000000000001'
            WHERE department_id IS NULL AND role = 'team-member';
            """,
             "Migration successful! Backfilled team-member users with AI department."),

            # Enforce NOT NULL on the two tables that must always have a dept
            ("ALTER TABLE candidates ALTER COLUMN department_id SET NOT NULL;",
             "Migration successful! candidates.department_id is now NOT NULL."),
            ("ALTER TABLE interviews ALTER COLUMN department_id SET NOT NULL;",
             "Migration successful! interviews.department_id is now NOT NULL."),
            ("ALTER TABLE lead_threads ADD COLUMN IF NOT EXISTS bd_notes TEXT;",
             "Migration successful! 'bd_notes' column added to 'lead_threads' table."),
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(100);",
             "Migration successful! 'reset_token' column added to 'users' table."),
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMP;",
             "Migration successful! 'reset_token_expires_at' column added to 'users' table."),

            # ── Unresponsive lead follow-up notifications ─────────────────────────────
            ("""
            CREATE TABLE IF NOT EXISTS unresponsive_followup_logs (
                id UUID PRIMARY KEY,
                thread_id UUID NOT NULL REFERENCES lead_threads(thread_id) ON DELETE CASCADE,
                sent_at_utc TIMESTAMP NOT NULL
            );
            """,
             "Migration successful! 'unresponsive_followup_logs' table ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_unresponsive_followup_logs_thread_id ON unresponsive_followup_logs (thread_id);",
             "Migration successful! Index on unresponsive_followup_logs.thread_id ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_unresponsive_followup_logs_sent_at_utc ON unresponsive_followup_logs (sent_at_utc);",
             "Migration successful! Index on unresponsive_followup_logs.sent_at_utc ensured."),
            ("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_unresponsive_followup_once
            ON unresponsive_followup_logs (thread_id);
            """,
             "Migration successful! Unique de-dup index for unresponsive follow-up logs ensured."),

            # ── Per-user notification read tracking ───────────────────────────────────
            ("""
            CREATE TABLE IF NOT EXISTS notification_reads (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                thread_id UUID NOT NULL,
                read_at TIMESTAMP NOT NULL
            );
            """,
             "Migration successful! 'notification_reads' table ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_notification_reads_user_id ON notification_reads (user_id);",
             "Migration successful! Index on notification_reads.user_id ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_notification_reads_thread_id ON notification_reads (thread_id);",
             "Migration successful! Index on notification_reads.thread_id ensured."),
            ("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_read_user_thread
            ON notification_reads (user_id, thread_id);
            """,
             "Migration successful! Unique index on notification_reads (user_id, thread_id) ensured."),
            ("ALTER TABLE business_developers ADD COLUMN IF NOT EXISTS email VARCHAR(255);",
             "Migration successful! 'email' column added to 'business_developers' table."),
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_dept_ids TEXT;",
             "Migration successful! 'allowed_dept_ids' column added to 'users' table."),

            ("ALTER TABLE business_developers ADD COLUMN IF NOT EXISTS department_ids TEXT;",
             "Migration successful! 'department_ids' column added to 'business_developers' table."),
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20);",
             "Migration successful! 'accent_color' column added to 'users' table."),

            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;",
             "Migration successful! 'created_by' column added to 'users' table."),
            ("CREATE INDEX IF NOT EXISTS ix_users_created_by ON users (created_by);",
             "Migration successful! Index on users.created_by ensured."),

            # ── Busy days: department scope ───────────────────────────────────────────
            ("ALTER TABLE busy_days ADD COLUMN IF NOT EXISTS department_id UUID;",
             "Migration successful! 'department_id' column added to 'busy_days' table."),
            ("CREATE INDEX IF NOT EXISTS ix_busy_days_department_id ON busy_days (department_id);",
             "Migration successful! Index on busy_days.department_id ensured."),
            # Drop old per-(user, date) unique constraint; replace with partial indexes
            ("ALTER TABLE busy_days DROP CONSTRAINT IF EXISTS uq_busy_day_per_user_date;",
             "Migration successful! Old unique constraint on busy_days (user_id, date) dropped."),
            # Dept-specific busy days: unique per (user, date, department)
            ("CREATE UNIQUE INDEX IF NOT EXISTS uq_busy_day_user_date_dept ON busy_days (user_id, date, department_id) WHERE department_id IS NOT NULL;",
             "Migration successful! Partial unique index for dept-specific busy days ensured."),
            # General busy days (null dept): unique per (user, date)
            ("CREATE UNIQUE INDEX IF NOT EXISTS uq_busy_day_user_date_nodept ON busy_days (user_id, date) WHERE department_id IS NULL;",
             "Migration successful! Partial unique index for general busy days ensured."),

            # Drop any FK on thread_id — not all interview threads have a lead_threads row
            ("""
            DO $$
            DECLARE r RECORD;
            BEGIN
              FOR r IN
                SELECT c.conname
                FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
                WHERE t.relname = 'notification_reads' AND c.contype = 'f' AND a.attname = 'thread_id'
              LOOP
                EXECUTE 'ALTER TABLE notification_reads DROP CONSTRAINT ' || r.conname;
              END LOOP;
            END;
            $$;
            """,
             "Migration successful! Any FK on notification_reads.thread_id dropped."),

            # ── Candidate active/inactive status ──────────────────────────────────────
            ("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;",
             "Migration successful! 'is_active' column added to 'candidates' table."),
            ("CREATE INDEX IF NOT EXISTS ix_candidates_is_active ON candidates (is_active);",
             "Migration successful! Index on candidates.is_active ensured."),

            # ── Interview created_by_user_id tracking ─────────────────────────────────
            ("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;",
             "Migration successful! 'created_by_user_id' column added to 'interviews' table."),
            ("CREATE INDEX IF NOT EXISTS ix_interviews_created_by_user_id ON interviews (created_by_user_id);",
             "Migration successful! Index on interviews.created_by_user_id ensured."),

            # ── Per-interview resume upload ────────────────────────────────────────────
            ("ALTER TABLE interviews ADD COLUMN IF NOT EXISTS resume_url VARCHAR(1000);",
             "Migration successful! 'resume_url' column added to 'interviews' table."),

            # ── Job roles dictionary (for role autocomplete) ──────────────────────────
            ("""
            CREATE TABLE IF NOT EXISTS job_roles (
                id UUID PRIMARY KEY,
                name VARCHAR(300) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """,
             "Migration successful! 'job_roles' table ensured."),
            ("CREATE UNIQUE INDEX IF NOT EXISTS uq_job_roles_name ON job_roles (name);",
             "Migration successful! Unique index on job_roles.name ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_job_roles_name ON job_roles (name);",
             "Migration successful! Index on job_roles.name ensured."),

            # ── BD → resume profile one-to-many relationship ──────────────────────────
            ("ALTER TABLE resume_profiles ADD COLUMN IF NOT EXISTS bd_id UUID REFERENCES business_developers(id) ON DELETE SET NULL;",
             "Migration successful! 'bd_id' column added to 'resume_profiles' table."),
            ("CREATE INDEX IF NOT EXISTS ix_resume_profiles_bd_id ON resume_profiles (bd_id);",
             "Migration successful! Index on resume_profiles.bd_id ensured."),

            # ── BD team hierarchy: explicit User → BD entity and team lead links ──────
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS bd_entity_id UUID REFERENCES business_developers(id) ON DELETE SET NULL;",
             "Migration successful! 'bd_entity_id' column added to 'users' table."),
            ("CREATE INDEX IF NOT EXISTS ix_users_bd_entity_id ON users (bd_entity_id);",
             "Migration successful! Index on users.bd_entity_id ensured."),
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS team_lead_user_id UUID REFERENCES users(id) ON DELETE SET NULL;",
             "Migration successful! 'team_lead_user_id' column added to 'users' table."),
            ("CREATE INDEX IF NOT EXISTS ix_users_team_lead_user_id ON users (team_lead_user_id);",
             "Migration successful! Index on users.team_lead_user_id ensured."),

            # ── User active/inactive status ───────────────────────────────────────────
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;",
             "Migration successful! 'is_active' column added to 'users' table."),
            ("CREATE INDEX IF NOT EXISTS ix_users_is_active ON users (is_active);",
             "Migration successful! Index on users.is_active ensured."),

            # ── Broadcast modals (superadmin announcements) ────────────────────────────
            ("""
            CREATE TABLE IF NOT EXISTS broadcast_modals (
                id UUID PRIMARY KEY,
                title VARCHAR(300) NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                is_published BOOLEAN NOT NULL DEFAULT FALSE,
                created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                published_at TIMESTAMP
            );
            """,
             "Migration successful! 'broadcast_modals' table ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_broadcast_modals_is_published ON broadcast_modals (is_published);",
             "Migration successful! Index on broadcast_modals.is_published ensured."),
            ("CREATE INDEX IF NOT EXISTS ix_broadcast_modals_created_at ON broadcast_modals (created_at);",
             "Migration successful! Index on broadcast_modals.created_at ensured."),

            # ── Broadcast modal customisation columns ─────────────────────────────────
            ("ALTER TABLE broadcast_modals ADD COLUMN IF NOT EXISTS theme VARCHAR(50) NOT NULL DEFAULT 'indigo';",
             "Migration successful! 'theme' column added to 'broadcast_modals' table."),
            ("ALTER TABLE broadcast_modals ADD COLUMN IF NOT EXISTS title_size VARCHAR(10) NOT NULL DEFAULT 'md';",
             "Migration successful! 'title_size' column added to 'broadcast_modals' table."),
            ("ALTER TABLE broadcast_modals ADD COLUMN IF NOT EXISTS image_url VARCHAR(1000);",
             "Migration successful! 'image_url' column added to 'broadcast_modals' table."),
            ("ALTER TABLE broadcast_modals ADD COLUMN IF NOT EXISTS badge_label VARCHAR(100) NOT NULL DEFAULT 'Announcement';",
             "Migration successful! 'badge_label' column added to 'broadcast_modals' table."),
            ("ALTER TABLE broadcast_modals ADD COLUMN IF NOT EXISTS close_button_label VARCHAR(100) NOT NULL DEFAULT 'Got it';",
             "Migration successful! 'close_button_label' column added to 'broadcast_modals' table."),

            # ── Broadcast modal extra design fields ───────────────────────────────────
            ("ALTER TABLE broadcast_modals ADD COLUMN IF NOT EXISTS modal_size VARCHAR(10) NOT NULL DEFAULT 'md';",
             "Migration successful! 'modal_size' column added to 'broadcast_modals' table."),
            ("ALTER TABLE broadcast_modals ADD COLUMN IF NOT EXISTS icon VARCHAR(50) NOT NULL DEFAULT 'Megaphone';",
             "Migration successful! 'icon' column added to 'broadcast_modals' table."),
            ("ALTER TABLE broadcast_modals ADD COLUMN IF NOT EXISTS text_align VARCHAR(10) NOT NULL DEFAULT 'left';",
             "Migration successful! 'text_align' column added to 'broadcast_modals' table."),
            ("ALTER TABLE broadcast_modals ADD COLUMN IF NOT EXISTS show_glow BOOLEAN NOT NULL DEFAULT FALSE;",
             "Migration successful! 'show_glow' column added to 'broadcast_modals' table."),
            ("ALTER TABLE broadcast_modals ADD COLUMN IF NOT EXISTS animation VARCHAR(20) NOT NULL DEFAULT 'zoom';",
             "Migration successful! 'animation' column added to 'broadcast_modals' table."),

            # ── Broadcast access permission for non-superadmin users ───────────────────
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS can_broadcast BOOLEAN NOT NULL DEFAULT FALSE;",
             "Migration successful! 'can_broadcast' column added to 'users' table."),
            ("CREATE INDEX IF NOT EXISTS ix_users_can_broadcast ON users (can_broadcast);",
             "Migration successful! Index on users.can_broadcast ensured."),

            # ── Broadcast modal image fit + celebration effect ─────────────────────────
            ("ALTER TABLE broadcast_modals ADD COLUMN IF NOT EXISTS image_fit VARCHAR(10) NOT NULL DEFAULT 'contain';",
             "Migration successful! 'image_fit' column added to 'broadcast_modals' table."),
            ("ALTER TABLE broadcast_modals ADD COLUMN IF NOT EXISTS effect VARCHAR(20) NOT NULL DEFAULT 'none';",
             "Migration successful! 'effect' column added to 'broadcast_modals' table."),

            # ── Candidate multi-department support ────────────────────────────────────
            ("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS department_ids TEXT;",
             "Migration successful! 'department_ids' column added to 'candidates' table."),
            # Backfill existing candidates: seed department_ids from the current single department_id
            ("""
            UPDATE candidates
            SET department_ids = '["' || department_id::text || '"]'
            WHERE department_ids IS NULL AND department_id IS NOT NULL;
            """,
             "Migration successful! Backfilled candidates.department_ids from existing department_id."),
            # ── Resume profile location field ─────────────────────────────────────────
            ("ALTER TABLE resume_profiles ADD COLUMN IF NOT EXISTS location VARCHAR(255);",
             "Migration successful! 'location' column added to 'resume_profiles' table."),

            # ── Per-user glassmorphism UI preference ──────────────────────────────────
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS glassmorphism_enabled BOOLEAN NOT NULL DEFAULT FALSE;",
             "Migration successful! 'glassmorphism_enabled' column added to 'users' table."),

            # ── Lead arrival date (independent of interview dates) ────────────────────
            ("ALTER TABLE lead_threads ADD COLUMN IF NOT EXISTS arrived_on DATE;",
             "Migration successful! 'arrived_on' column added to 'lead_threads' table."),
            # Backfill: copy interview_date from the root interview row (parent_interview_id IS NULL)
            # for each thread that already has a lead_threads row but no arrived_on yet.
            ("""
            UPDATE lead_threads lt
            SET arrived_on = sub.interview_date
            FROM (
                SELECT DISTINCT ON (thread_id) thread_id, interview_date
                FROM interviews
                WHERE parent_interview_id IS NULL
                ORDER BY thread_id, created_at ASC
            ) sub
            WHERE lt.thread_id = sub.thread_id
              AND lt.arrived_on IS NULL
              AND sub.interview_date IS NOT NULL;
            """,
             "Migration successful! Backfilled lead_threads.arrived_on from root interview rows."),

            # ── Ensure every interview thread has a lead_threads row ──────────────────
            # Threads created before ensure_lead_thread was universal may lack a row;
            # without it the arrived_on backfill below silently skips them.
            ("""
            INSERT INTO lead_threads (thread_id, created_at, updated_at)
            SELECT DISTINCT i.thread_id, NOW(), NOW()
            FROM interviews i
            WHERE NOT EXISTS (
                SELECT 1 FROM lead_threads lt WHERE lt.thread_id = i.thread_id
            )
            ON CONFLICT (thread_id) DO NOTHING;
            """,
             "Migration successful! Created lead_threads rows for orphan interview threads."),
            # Re-run arrived_on backfill to cover the newly created lead_threads rows above.
            ("""
            UPDATE lead_threads lt
            SET arrived_on = sub.interview_date
            FROM (
                SELECT DISTINCT ON (thread_id) thread_id, interview_date
                FROM interviews
                WHERE parent_interview_id IS NULL
                ORDER BY thread_id, created_at ASC
            ) sub
            WHERE lt.thread_id = sub.thread_id
              AND lt.arrived_on IS NULL
              AND sub.interview_date IS NOT NULL;
            """,
             "Migration successful! Backfilled arrived_on for newly created lead_threads rows."),

            # ── Alarm sound and style preferences ────────────────────────────────────
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS alarm_sound VARCHAR(30);",
             "Migration successful! 'alarm_sound' column added to 'users' table."),
            ("ALTER TABLE users ADD COLUMN IF NOT EXISTS alarm_style VARCHAR(20);",
             "Migration successful! 'alarm_style' column added to 'users' table."),

            # ── Clean up orphaned lead_threads rows ──────────────────────────────────
            # A bug in update_interview called _propagate_thread_id(new uuid) for root
            # interviews every time parent_interview_id=null was included in the payload
            # (which the frontend always does when editing). This rotated the thread_id
            # on every save, leaving the old lead_threads row with no interviews.
            # Those orphaned rows are safe to delete; they represent stale snapshots of
            # threads that were re-assigned.  Delete dependent rows first to satisfy FKs.
            ("""
            DELETE FROM unresponsive_followup_logs
            WHERE thread_id NOT IN (
                SELECT DISTINCT thread_id FROM interviews
            );
            """,
             "Migration successful! Deleted orphaned unresponsive_followup_logs for non-existent threads."),
            ("""
            DELETE FROM lead_threads
            WHERE thread_id NOT IN (
                SELECT DISTINCT thread_id FROM interviews
            );
            """,
             "Migration successful! Deleted orphaned lead_threads rows with no interviews."),

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
