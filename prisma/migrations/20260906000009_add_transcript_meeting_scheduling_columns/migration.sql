-- ==============================================================================
-- MeetingOS Migration
-- 20260906000009_add_transcript_meeting_scheduling_columns
-- Description: Adds missing scheduling, provider, and transcript ingestion columns.
-- ==============================================================================

-- 1. Alter transcripts table
ALTER TABLE "transcripts" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'UPLOAD';
ALTER TABLE "transcripts" ADD COLUMN IF NOT EXISTS "mime_type" TEXT;
ALTER TABLE "transcripts" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "transcripts" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'READY';

-- 2. Alter meetings table
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "provider" "MeetingSource" DEFAULT 'MANUAL';
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "provider_meeting_id" TEXT;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "provider_event_id" TEXT;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "meeting_url" TEXT;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "start_time" TIMESTAMP(3);
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "end_time" TIMESTAMP(3);
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "duration_seconds" INTEGER;

-- 3. Alter participants table
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "role" TEXT;
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "is_external" BOOLEAN NOT NULL DEFAULT false;

-- 4. Create Performance Indexes
CREATE INDEX IF NOT EXISTS "meetings_provider_provider_meeting_id_idx" 
    ON "meetings"("provider", "provider_meeting_id");
CREATE INDEX IF NOT EXISTS "meetings_organization_id_start_time_idx" 
    ON "meetings"("organization_id", "start_time");
CREATE INDEX IF NOT EXISTS "participants_email_idx" 
    ON "participants"("email");
