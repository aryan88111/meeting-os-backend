-- ==============================================================================
-- MeetingOS Migration
-- 20260906000005_create_documents_and_jobs
-- Description: Tracking generated document artifacts (HTML/PDF/DOCX) and background processing worker queue.
-- ==============================================================================

-- 1. DOCUMENTS
CREATE TABLE IF NOT EXISTS "documents" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "meeting_id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "storage_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documents_meeting_id_fkey" FOREIGN KEY ("meeting_id") 
        REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "documents_meeting_id_idx" 
    ON "documents"("meeting_id");

-- 2. PROCESSING JOBS
CREATE TABLE IF NOT EXISTS "processing_jobs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "meeting_id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "processing_jobs_meeting_id_fkey" FOREIGN KEY ("meeting_id") 
        REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "processing_jobs_meeting_id_idx" 
    ON "processing_jobs"("meeting_id");
CREATE INDEX IF NOT EXISTS "processing_jobs_status_job_type_idx" 
    ON "processing_jobs"("status", "job_type");
