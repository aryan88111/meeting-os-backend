-- ==============================================================================
-- MeetingOS Migration
-- 20260906000001_create_extensions_and_enums
-- Description: Enables required PostgreSQL extensions and creates custom ENUM types.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. CUSTOM ENUMS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
        CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MeetingStatus') THEN
        CREATE TYPE "MeetingStatus" AS ENUM (
            'CREATED',
            'WAITING_FOR_TRANSCRIPT',
            'TRANSCRIPT_RECEIVED',
            'QUEUED',
            'PROCESSING',
            'AI_COMPLETED',
            'DOCUMENT_GENERATING',
            'COMPLETED',
            'FAILED',
            'FAILED_PERMANENT'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MeetingSource') THEN
        CREATE TYPE "MeetingSource" AS ENUM ('MANUAL', 'GOOGLE_MEET', 'MICROSOFT_TEAMS', 'ZOOM');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActionItemStatus') THEN
        CREATE TYPE "ActionItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Priority') THEN
        CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentType') THEN
        CREATE TYPE "DocumentType" AS ENUM ('HTML', 'PDF', 'DOCX');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'JobStatus') THEN
        CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');
    END IF;
END $$;
