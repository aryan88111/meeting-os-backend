-- ==============================================================================
-- MeetingOS Migration
-- 20260906000008_create_triggers_and_rls_security
-- Description: Auto-updates updated_at timestamps and defines tenant isolation policies.
-- ==============================================================================

-- 1. REUSABLE UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. ATTACH UPDATED_AT TRIGGERS

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON "organizations";
CREATE TRIGGER trg_organizations_updated_at
BEFORE UPDATE ON "organizations"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON "users";
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON "users"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_organization_members_updated_at ON "organization_members";
CREATE TRIGGER trg_organization_members_updated_at
BEFORE UPDATE ON "organization_members"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_meetings_updated_at ON "meetings";
CREATE TRIGGER trg_meetings_updated_at
BEFORE UPDATE ON "meetings"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_transcripts_updated_at ON "transcripts";
CREATE TRIGGER trg_transcripts_updated_at
BEFORE UPDATE ON "transcripts"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_action_items_updated_at ON "action_items";
CREATE TRIGGER trg_action_items_updated_at
BEFORE UPDATE ON "action_items"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_documents_updated_at ON "documents";
CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE ON "documents"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_integrations_updated_at ON "integrations";
CREATE TRIGGER trg_integrations_updated_at
BEFORE UPDATE ON "integrations"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_integration_meetings_updated_at ON "integration_meetings";
CREATE TRIGGER trg_integration_meetings_updated_at
BEFORE UPDATE ON "integration_meetings"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. ROW LEVEL SECURITY (RLS) & HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION current_user_org_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = (SELECT auth.uid()::text);
$$;

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transcripts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transcript_segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "topics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "action_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "risks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "open_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "processing_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "embeddings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES
DROP POLICY IF EXISTS "org_member_access" ON "organizations";
CREATE POLICY "org_member_access" ON "organizations"
    FOR ALL
    USING (
        id IN (SELECT current_user_org_ids()) 
        OR auth.role() = 'service_role'
        OR current_user = 'postgres'
    );

DROP POLICY IF EXISTS "meetings_member_access" ON "meetings";
CREATE POLICY "meetings_member_access" ON "meetings"
    FOR ALL
    USING (
        organization_id IN (SELECT current_user_org_ids()) 
        OR auth.role() = 'service_role'
        OR current_user = 'postgres'
    );

DROP POLICY IF EXISTS "embeddings_member_access" ON "embeddings";
CREATE POLICY "embeddings_member_access" ON "embeddings"
    FOR ALL
    USING (
        organization_id IN (SELECT current_user_org_ids()) 
        OR auth.role() = 'service_role'
        OR current_user = 'postgres'
    );
