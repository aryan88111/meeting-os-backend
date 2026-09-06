-- ==============================================================================
-- MeetingOS Migration
-- 20260906000011_create_chat_sessions_and_messages
-- Description: Create chat_sessions and chat_messages tables for persistent RAG threads
-- ==============================================================================

-- CreateTable: chat_sessions
CREATE TABLE IF NOT EXISTS "chat_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Conversation',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: chat_messages
CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "relevant_meetings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "chat_sessions_organization_id_user_id_updated_at_idx" 
    ON "chat_sessions"("organization_id", "user_id", "updated_at");

CREATE INDEX IF NOT EXISTS "chat_messages_session_id_created_at_idx" 
    ON "chat_messages"("session_id", "created_at");

-- ForeignKeys
ALTER TABLE "chat_sessions" 
    ADD CONSTRAINT "chat_sessions_organization_id_fkey" 
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_sessions" 
    ADD CONSTRAINT "chat_sessions_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_messages" 
    ADD CONSTRAINT "chat_messages_session_id_fkey" 
    FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
