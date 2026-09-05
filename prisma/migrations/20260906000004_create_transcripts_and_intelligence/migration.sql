-- ==============================================================================
-- MeetingOS Migration
-- 20260906000004_create_transcripts_and_intelligence
-- Description: Transcript audio offsets, AI summaries, decisions, action items, topics, risks, questions.
-- ==============================================================================

-- 1. TRANSCRIPTS
CREATE TABLE IF NOT EXISTS "transcripts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "meeting_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'UPLOAD',
    "storage_key" TEXT,
    "mime_type" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transcripts_meeting_id_fkey" FOREIGN KEY ("meeting_id") 
        REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "transcripts_meeting_id_idx" 
    ON "transcripts"("meeting_id");

-- 2. TRANSCRIPT SEGMENTS
CREATE TABLE IF NOT EXISTS "transcript_segments" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "transcript_id" TEXT NOT NULL,
    "speaker_id" TEXT,
    "speaker_name" TEXT,
    "text" TEXT NOT NULL,
    "start_time_ms" BIGINT,
    "end_time_ms" BIGINT,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transcript_segments_transcript_id_fkey" FOREIGN KEY ("transcript_id") 
        REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "transcript_segments_transcript_id_sequence_idx" 
    ON "transcript_segments"("transcript_id", "sequence");
CREATE INDEX IF NOT EXISTS "transcript_segments_transcript_id_start_time_ms_idx" 
    ON "transcript_segments"("transcript_id", "start_time_ms");

-- 3. MEETING SUMMARIES
CREATE TABLE IF NOT EXISTS "meeting_summaries" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "meeting_id" TEXT NOT NULL,
    "executive_summary" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "model" TEXT,
    "model_version" TEXT,
    "prompt_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_summaries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "meeting_summaries_meeting_id_fkey" FOREIGN KEY ("meeting_id") 
        REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "meeting_summaries_meeting_id_idx" 
    ON "meeting_summaries"("meeting_id");

-- 4. TOPICS
CREATE TABLE IF NOT EXISTS "topics" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "meeting_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "topics_meeting_id_fkey" FOREIGN KEY ("meeting_id") 
        REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "topics_meeting_id_idx" 
    ON "topics"("meeting_id");

-- 5. DECISIONS
CREATE TABLE IF NOT EXISTS "decisions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "meeting_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "context" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source_segment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "decisions_meeting_id_fkey" FOREIGN KEY ("meeting_id") 
        REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "decisions_source_segment_id_fkey" FOREIGN KEY ("source_segment_id") 
        REFERENCES "transcript_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "decisions_meeting_id_idx" 
    ON "decisions"("meeting_id");

-- 6. ACTION ITEMS
CREATE TABLE IF NOT EXISTS "action_items" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "meeting_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignee_user_id" TEXT,
    "assignee_name" TEXT,
    "deadline" TIMESTAMP(3),
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ActionItemStatus" NOT NULL DEFAULT 'PENDING',
    "source_segment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "action_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") 
        REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "action_items_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") 
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "action_items_source_segment_id_fkey" FOREIGN KEY ("source_segment_id") 
        REFERENCES "transcript_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "action_items_meeting_id_idx" 
    ON "action_items"("meeting_id");
CREATE INDEX IF NOT EXISTS "action_items_assignee_user_id_idx" 
    ON "action_items"("assignee_user_id");
CREATE INDEX IF NOT EXISTS "action_items_status_idx" 
    ON "action_items"("status");

-- 7. RISKS
CREATE TABLE IF NOT EXISTS "risks" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "meeting_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "source_segment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "risks_meeting_id_fkey" FOREIGN KEY ("meeting_id") 
        REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "risks_source_segment_id_fkey" FOREIGN KEY ("source_segment_id") 
        REFERENCES "transcript_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "risks_meeting_id_idx" 
    ON "risks"("meeting_id");

-- 8. OPEN QUESTIONS
CREATE TABLE IF NOT EXISTS "open_questions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "meeting_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "owner" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "source_segment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "open_questions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "open_questions_meeting_id_fkey" FOREIGN KEY ("meeting_id") 
        REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "open_questions_source_segment_id_fkey" FOREIGN KEY ("source_segment_id") 
        REFERENCES "transcript_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "open_questions_meeting_id_idx" 
    ON "open_questions"("meeting_id");
