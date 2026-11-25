-- AlterEnum
ALTER TYPE "MeetingSource" ADD VALUE IF NOT EXISTS 'MEETINGOS_ROOM';

-- CreateTable
CREATE TABLE IF NOT EXISTS "room_sessions" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "room_name" TEXT NOT NULL,
    "room_sid" TEXT,
    "active_participants" INTEGER NOT NULL DEFAULT 0,
    "is_live" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "recording_url" TEXT,
    "egress_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "room_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "room_sessions_meeting_id_is_live_idx" ON "room_sessions"("meeting_id", "is_live");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "room_sessions_room_name_idx" ON "room_sessions"("room_name");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'room_sessions_meeting_id_fkey'
    ) THEN
        ALTER TABLE "room_sessions" ADD CONSTRAINT "room_sessions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
