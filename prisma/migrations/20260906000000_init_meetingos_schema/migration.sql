-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('CREATED', 'WAITING_FOR_TRANSCRIPT', 'TRANSCRIPT_RECEIVED', 'QUEUED', 'PROCESSING', 'AI_COMPLETED', 'DOCUMENT_GENERATING', 'COMPLETED', 'FAILED', 'FAILED_PERMANENT');

-- CreateEnum
CREATE TYPE "MeetingSource" AS ENUM ('MANUAL', 'GOOGLE_MEET', 'MICROSOFT_TEAMS', 'ZOOM');

-- CreateEnum
CREATE TYPE "ActionItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('HTML', 'PDF', 'DOCX');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'CREATED',
    "source" "MeetingSource" NOT NULL DEFAULT 'MANUAL',
    "provider" "MeetingSource",
    "provider_meeting_id" TEXT,
    "provider_event_id" TEXT,
    "meeting_url" TEXT,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT,
    "is_external" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "storage_key" TEXT,
    "raw_text" TEXT,
    "word_count" INTEGER,
    "language" TEXT DEFAULT 'en',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" TEXT NOT NULL,
    "transcript_id" TEXT NOT NULL,
    "speaker_id" TEXT,
    "speaker_name" TEXT,
    "text" TEXT NOT NULL,
    "start_time_ms" BIGINT,
    "end_time_ms" BIGINT,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_summaries" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "executive_summary" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "model" TEXT,
    "model_version" TEXT,
    "prompt_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisions" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "context" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source_segment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_items" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignee_user_id" TEXT,
    "assignee_name" TEXT,
    "deadline" TIMESTAMP(3),
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ActionItemStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source_segment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risks" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "mitigation" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source_segment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_questions" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "assigned_to" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "source_segment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "open_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "storage_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" "MeetingSource" NOT NULL,
    "provider_user_id" TEXT,
    "encrypted_access_token" TEXT,
    "encrypted_refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "scopes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_meetings" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "provider_meeting_id" TEXT NOT NULL,
    "provider_event_id" TEXT,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "transcript_segment_id" TEXT,
    "chunk_text" TEXT NOT NULL,
    "embedding" vector(768),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "meetings_organization_id_created_at_idx" ON "meetings"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "meetings_organization_id_status_idx" ON "meetings"("organization_id", "status");

-- CreateIndex
CREATE INDEX "meetings_provider_provider_meeting_id_idx" ON "meetings"("provider", "provider_meeting_id");

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_meeting_id_key" ON "transcripts"("meeting_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_summaries_meeting_id_key" ON "meeting_summaries"("meeting_id");

-- CreateIndex
CREATE INDEX "transcript_segments_transcript_id_sequence_idx" ON "transcript_segments"("transcript_id", "sequence");

-- CreateIndex
CREATE INDEX "transcript_segments_transcript_id_start_time_ms_idx" ON "transcript_segments"("transcript_id", "start_time_ms");

-- CreateIndex
CREATE INDEX "embeddings_organization_id_idx" ON "embeddings"("organization_id");

-- CreateIndex
CREATE INDEX "embeddings_meeting_id_idx" ON "embeddings"("meeting_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_source_segment_id_fkey" FOREIGN KEY ("source_segment_id") REFERENCES "transcript_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_source_segment_id_fkey" FOREIGN KEY ("source_segment_id") REFERENCES "transcript_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_source_segment_id_fkey" FOREIGN KEY ("source_segment_id") REFERENCES "transcript_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_questions" ADD CONSTRAINT "open_questions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_questions" ADD CONSTRAINT "open_questions_source_segment_id_fkey" FOREIGN KEY ("source_segment_id") REFERENCES "transcript_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_meetings" ADD CONSTRAINT "integration_meetings_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_meetings" ADD CONSTRAINT "integration_meetings_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_transcript_segment_id_fkey" FOREIGN KEY ("transcript_segment_id") REFERENCES "transcript_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
