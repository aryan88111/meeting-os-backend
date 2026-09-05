-- ==============================================================================
-- MeetingOS Migration
-- 20260906000003_create_meetings_and_participants
-- Description: Core meeting scheduling, third-party video call metadata, and participant rosters.
-- ==============================================================================

-- 1. MEETINGS
CREATE TABLE IF NOT EXISTS "meetings" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organization_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'CREATED',
    "source" "MeetingSource" NOT NULL DEFAULT 'MANUAL',
    "provider" "MeetingSource" DEFAULT 'MANUAL',
    "provider_meeting_id" TEXT,
    "provider_event_id" TEXT,
    "meeting_url" TEXT,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "meetings_organization_id_fkey" FOREIGN KEY ("organization_id") 
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "meetings_created_by_fkey" FOREIGN KEY ("created_by") 
        REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "meetings_organization_id_created_at_idx" 
    ON "meetings"("organization_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "meetings_organization_id_status_idx" 
    ON "meetings"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "meetings_organization_id_start_time_idx" 
    ON "meetings"("organization_id", "start_time");
CREATE INDEX IF NOT EXISTS "meetings_provider_provider_meeting_id_idx" 
    ON "meetings"("provider", "provider_meeting_id");

-- 2. PARTICIPANTS
CREATE TABLE IF NOT EXISTS "participants" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "meeting_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT,
    "is_external" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") 
        REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "participants_meeting_id_idx" 
    ON "participants"("meeting_id");
CREATE INDEX IF NOT EXISTS "participants_email_idx" 
    ON "participants"("email");
