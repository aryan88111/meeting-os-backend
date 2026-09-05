-- ==============================================================================
-- MeetingOS Migration
-- 20260906000006_create_integrations_and_audit
-- Description: Third-party OAuth integrations (Google/Zoom/Teams) and multi-tenant audit logs.
-- ==============================================================================

-- 1. INTEGRATIONS
CREATE TABLE IF NOT EXISTS "integrations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organization_id" TEXT NOT NULL,
    "provider" "MeetingSource" NOT NULL,
    "provider_user_id" TEXT,
    "encrypted_access_token" TEXT,
    "encrypted_refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "scopes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "integrations_organization_id_fkey" FOREIGN KEY ("organization_id") 
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "integrations_organization_id_provider_idx" 
    ON "integrations"("organization_id", "provider");

-- 2. INTEGRATION MEETINGS
CREATE TABLE IF NOT EXISTS "integration_meetings" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "integration_id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "provider_meeting_id" TEXT NOT NULL,
    "provider_event_id" TEXT,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_meetings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "integration_meetings_integration_id_fkey" FOREIGN KEY ("integration_id") 
        REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "integration_meetings_meeting_id_fkey" FOREIGN KEY ("meeting_id") 
        REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "integration_meetings_integration_id_provider_meeting_id_idx" 
    ON "integration_meetings"("integration_id", "provider_meeting_id");
CREATE INDEX IF NOT EXISTS "integration_meetings_meeting_id_idx" 
    ON "integration_meetings"("meeting_id");

-- 3. AUDIT LOGS
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") 
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") 
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "audit_logs_organization_id_created_at_idx" 
    ON "audit_logs"("organization_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_resource_type_resource_id_idx" 
    ON "audit_logs"("resource_type", "resource_id");
