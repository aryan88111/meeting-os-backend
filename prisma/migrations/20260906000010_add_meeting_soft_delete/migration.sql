-- ==============================================================================
-- MeetingOS Migration
-- 20260906000010_add_meeting_soft_delete
-- Description: Add soft-delete flag (is_active) and timestamp (deleted_at) to meetings.
-- ==============================================================================

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meetings_organization_id_is_active_idx" 
    ON "meetings"("organization_id", "is_active");
