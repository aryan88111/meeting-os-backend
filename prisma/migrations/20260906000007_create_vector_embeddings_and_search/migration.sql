-- ==============================================================================
-- MeetingOS Migration
-- 20260906000007_create_vector_embeddings_and_search
-- Description: pgvector 768-dimensional embeddings, HNSW index, and semantic search procedure.
-- ==============================================================================

-- 1. EMBEDDINGS TABLE
CREATE TABLE IF NOT EXISTS "embeddings" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organization_id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "transcript_segment_id" TEXT,
    "chunk_text" TEXT NOT NULL,
    "embedding" vector(768),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "embeddings_organization_id_fkey" FOREIGN KEY ("organization_id") 
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "embeddings_meeting_id_fkey" FOREIGN KEY ("meeting_id") 
        REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "embeddings_transcript_segment_id_fkey" FOREIGN KEY ("transcript_segment_id") 
        REFERENCES "transcript_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "embeddings_organization_id_idx" 
    ON "embeddings"("organization_id");
CREATE INDEX IF NOT EXISTS "embeddings_meeting_id_idx" 
    ON "embeddings"("meeting_id");
CREATE INDEX IF NOT EXISTS "embeddings_transcript_segment_id_idx" 
    ON "embeddings"("transcript_segment_id");
CREATE INDEX IF NOT EXISTS "embeddings_chunk_text_fts_idx" 
    ON "embeddings" USING gin (to_tsvector('english', "chunk_text"));
CREATE INDEX IF NOT EXISTS "embeddings_vector_cosine_idx" 
    ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);

-- 2. SEMANTIC SEARCH STORED FUNCTION (Supabase RPC Compatible)
CREATE OR REPLACE FUNCTION match_embeddings(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 10,
    filter_org_id text DEFAULT NULL,
    filter_meeting_id text DEFAULT NULL
)
RETURNS TABLE (
    id text,
    organization_id text,
    meeting_id text,
    transcript_segment_id text,
    chunk_text text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.organization_id,
        e.meeting_id,
        e.transcript_segment_id,
        e.chunk_text,
        e.metadata,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM embeddings e
    WHERE (filter_org_id IS NULL OR e.organization_id = filter_org_id)
      AND (filter_meeting_id IS NULL OR e.meeting_id = filter_meeting_id)
      AND (e.embedding IS NOT NULL)
      AND (1 - (e.embedding <=> query_embedding)) > match_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
