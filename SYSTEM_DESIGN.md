# MeetingOS System Design & Architectural Specification

An industry-grade, end-to-end technical system design and architectural specification for **MeetingOS** — an enterprise AI-powered meeting intelligence, automated scheduling, speaker diarization, and vector RAG platform.

---

## 1. System Overview & Core Capabilities

MeetingOS transforms disorganized multi-platform meetings into structured, actionable enterprise knowledge. Key capabilities include:

1. **Multi-Platform Automated Scheduling**: Direct integration with **Google Meet / Calendar** and **Microsoft Teams / Microsoft 365** with intelligent multi-tier fallback for enterprise vs. personal accounts.
2. **Transcript Processing & Speaker Diarization**: High-fidelity ingestion of raw transcripts, audio/video streams, and automated speaker alignment.
3. **Structured Intelligence Extraction**: Two-phase LLM processing via Google Gemini 1.5 Pro/Flash to generate executive summaries, key topics, decisions made, prioritized action items, and organizational risks.
4. **Vector RAG & Semantic Search**: 768-dimensional vector embeddings stored in **PostgreSQL + `pgvector`** enabling cross-meeting semantic query retrieval, citations, and interactive AI chat.
5. **Multi-Tenant Security & Role-Based Access Control (RBAC)**: Secure multi-tenancy with organization isolation, audit logging, and encrypted OAuth token orchestration.

---

## 2. Architecture Diagrams (Mermaid)

### 2.1 High-Level Container & Network Topology

```mermaid
flowchart TB
    subgraph CLIENT_LAYER ["🖥️ Client Tier (Presentation Layer)"]
        UI["React 19 + TypeScript SPA (Vite)"]
        STORE["Zustand State Stores (Auth, Meetings, UI)"]
        ROUTER["React Router v7"]
        UI --> STORE
        UI --> ROUTER
    end

    subgraph INGRESS_LAYER ["🛡️ Ingress & Security Layer"]
        AUTH_GUARD["Supabase JWT & RBAC Guard"]
        RATE_LIMITER["Throttler / Rate Limiting Middleware"]
        API_KEYS["API Key Signature Validator"]
    end

    subgraph API_GATEWAY ["⚡ Application Core (NestJS 10 Framework)"]
        AUTH_MOD["Auth Module (OAuth, Supabase Sync)"]
        MEETINGS_MOD["Meetings Module (Scheduling & Lifecycle)"]
        INTEGRATIONS_MOD["Integrations Module (Token Orchestrator)"]
        TRANSCRIPTS_MOD["Transcripts Module (Diarization Ingestion)"]
        INTELLIGENCE_MOD["Intelligence Module (Gemini LLM)"]
        DOCS_MOD["Documents Module (PDF/HTML/Briefings)"]
        SEARCH_MOD["Search & RAG Module (Hybrid Vector Retrieval)"]
        AUDIT_MOD["Audit & Compliance Module"]
    end

    subgraph ASYNC_MESSAGE_BUS ["📨 Message Broker & Async Task Queue"]
        RABBIT_MQ[("RabbitMQ Cluster")]
        Q_INTEL["Queue: meetingos.intelligence"]
        Q_TRANSCRIPT["Queue: meetingos.transcripts"]
        Q_CALENDAR["Queue: meetingos.calendar.sync"]
        DLQ["Dead Letter Exchange (DLQ + Exponential Backoff)"]
        RABBIT_MQ --> Q_INTEL
        RABBIT_MQ --> Q_TRANSCRIPT
        RABBIT_MQ --> Q_CALENDAR
        RABBIT_MQ --> DLQ
    end

    subgraph PERSISTENCE_LAYER ["💾 Data Persistence Layer"]
        PG_DB[("PostgreSQL 16 Engine")]
        PG_VECTOR[("pgvector Extension (768-dim Embeddings)")]
        STORAGE_BUCKET[("Object Storage (S3 / Supabase Buckets)")]
        PRISMA["Prisma ORM Client"]
        PRISMA --> PG_DB
        PRISMA --> PG_VECTOR
    end

    subgraph EXTERNAL_APIS ["🌐 External Cloud Providers & AI Services"]
        SUPABASE["Supabase Auth & Session Service"]
        GOOGLE_API["Google Workspace (OAuth2, Calendar v3, Meet API)"]
        MS_GRAPH["Microsoft Entra ID & Graph API (Teams, Calendar)"]
        GEMINI_AI["Google Gemini 1.5 Pro / Flash & Embedding API"]
    end

    %% Client to Ingress
    CLIENT_LAYER -- "HTTPS / REST API + Bearer JWT" --> INGRESS_LAYER
    INGRESS_LAYER --> API_GATEWAY

    %% API Gateway to External Auth & Services
    AUTH_MOD <--> SUPABASE
    INTEGRATIONS_MOD <--> GOOGLE_API
    INTEGRATIONS_MOD <--> MS_GRAPH
    INTELLIGENCE_MOD <--> GEMINI_AI
    SEARCH_MOD <--> GEMINI_AI

    %% Modules to Persistence
    API_GATEWAY --> PRISMA
    TRANSCRIPTS_MOD -- "Store Raw Audio/VTT" --> STORAGE_BUCKET
    DOCS_MOD -- "Export Artifacts" --> STORAGE_BUCKET

    %% Async Dispatch
    MEETINGS_MOD -- "Enqueue Meeting Sync" --> Q_CALENDAR
    TRANSCRIPTS_MOD -- "Enqueue AI Extraction" --> Q_INTEL
    TRANSCRIPTS_MOD -- "Enqueue Segmentation" --> Q_TRANSCRIPT
    Q_INTEL --> INTELLIGENCE_MOD
    Q_TRANSCRIPT --> TRANSCRIPTS_MOD
    Q_CALENDAR --> INTEGRATIONS_MOD
```

---

### 2.2 Multi-Tier Video & Calendar Dispatch Engine

MeetingOS features a 4-tier fallback architecture to seamlessly support both Microsoft 365 Work/Enterprise tenants and personal Microsoft accounts without operational failures.

```mermaid
flowchart TD
    START([User Schedules Meeting]) --> CHECK_PROV{Select Provider}

    %% Google Flow
    CHECK_PROV -- "GOOGLE_MEET" --> G_TOKEN[Verify Google OAuth Token]
    G_TOKEN --> G_CALL[Call Google Calendar v3 API: createEvent + conferenceData]
    G_CALL --> G_SUCCESS{Created?}
    G_SUCCESS -- Yes --> G_SAVE[Save meetingUrl + providerMeetingId to DB]
    G_SUCCESS -- "No / Expired (401)" --> G_REFRESH[Refresh Token via Google OAuth Endpoint]
    G_REFRESH --> G_CALL

    %% Microsoft Teams Flow
    CHECK_PROV -- "MICROSOFT_TEAMS" --> MS_TOKEN[Verify / Refresh Microsoft Graph Token]
    MS_TOKEN --> TIER1[Tier 1: POST /me/onlineMeetings]
    
    TIER1 --> T1_STATUS{201 Created?}
    T1_STATUS -- "Yes (Enterprise M365)" --> MS_SAVE_T1[Save Official Join URL & OnlineMeeting ID]
    
    T1_STATUS -- "400 / 401 / Personal Account" --> TIER2[Tier 2: POST /me/events with teamsForBusiness]
    TIER2 --> T2_STATUS{201 Created?}
    T2_STATUS -- "Yes (M365 with Calendar)" --> MS_SAVE_T2[Save Event Join URL & Calendar Event ID]
    
    T2_STATUS -- "Failed / Personal Scope" --> TIER3[Tier 3: Standard /me/events Calendar Invite]
    TIER3 --> T3_STATUS{201 Created?}
    T3_STATUS -- "Yes (Outlook Personal)" --> MS_SAVE_T3[Save Calendar Event + Fallback Link]
    
    T3_STATUS -- "Failed (Personal Free Account)" --> TIER4[Tier 4: MeetingOS Direct Teams Room Dispatcher]
    TIER4 --> MS_FALLBACK[Generate Direct Teams Meetup URL + Open Join Link]
    MS_FALLBACK --> COPY_TOOL[Enable 1-Click Attendee Email Copy System]
    
    G_SAVE --> PERSIST([Meeting Ready in Dashboard])
    MS_SAVE_T1 --> PERSIST
    MS_SAVE_T2 --> PERSIST
    MS_SAVE_T3 --> PERSIST
    COPY_TOOL --> PERSIST
```

---

### 2.3 Asynchronous Intelligence & Vector RAG Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Client
    participant API as Meetings & Transcripts API
    participant Queue as RabbitMQ (meetingos.intelligence)
    participant Worker as Async Intelligence Worker
    participant Gemini as Google Gemini 1.5 LLM
    participant DB as PostgreSQL + pgvector (Prisma)
    participant Storage as Object Storage (S3 / Supabase)

    User->>API: Upload Transcript / Ingest Meeting
    API->>Storage: Store Raw Transcript File (.vtt / .json / .txt)
    API->>DB: Create Transcript & TranscriptSegments (Diarized)
    API->>DB: Update MeetingStatus -> TRANSCRIPT_RECEIVED -> QUEUED
    API->>Queue: Publish Job { meetingId, transcriptId, orgId }
    API-->>User: 202 Accepted (Processing in Background)

    Queue->>Worker: Consume Job from meetingos.intelligence
    Worker->>DB: Update MeetingStatus -> PROCESSING & Create ProcessingJob
    Worker->>DB: Fetch TranscriptSegments ordered by sequence
    
    Note over Worker,Gemini: Phase 1: Structured AI Analysis (JSON Schema Enforcement)
    Worker->>Gemini: Prompt with Segments + Metaprompt
    Gemini-->>Worker: Return Structured JSON (Executive Summary, Topics, Decisions, Action Items, Risks, Questions)
    
    Worker->>DB: Save MeetingSummary (Executive Brief + Detailed Markdown)
    Worker->>DB: Save Topics (Importance, Summaries)
    Worker->>DB: Save Decisions (Context, Confidence, sourceSegmentId)
    Worker->>DB: Save ActionItems (Assignee, Priority, Deadline, Status)
    Worker->>DB: Save Risks (Severity, Mitigation, Confidence)
    Worker->>DB: Save OpenQuestions (AssignedTo, Status)

    Note over Worker,Gemini: Phase 2: Semantic Vector Indexing
    Worker->>Gemini: Batch Generate Embeddings (768-dim) for Chunks/Segments
    Gemini-->>Worker: Vector Embeddings Array
    Worker->>DB: Bulk Insert into `embeddings` table (pgvector)

    Worker->>DB: Update MeetingStatus -> COMPLETED & ProcessingJob -> COMPLETED
    Worker-->>User: WebSocket / SSE Event: Meeting Intelligence Ready
```

---

### 2.4 Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    ORGANIZATION ||--o{ USER_ORGANIZATION_MEMBER : "has members"
    USER ||--o{ USER_ORGANIZATION_MEMBER : "belongs to"
    ORGANIZATION ||--o{ MEETING : "owns"
    USER ||--o{ MEETING : "creates"
    ORGANIZATION ||--o{ INTEGRATION : "configures"
    ORGANIZATION ||--o{ AUDIT_LOG : "records"
    ORGANIZATION ||--o{ CHAT_SESSION : "owns"
    ORGANIZATION ||--o{ API_KEY : "issues"
    ORGANIZATION ||--o{ EMBEDDING : "indexes"

    MEETING ||--o{ PARTICIPANT : "has"
    MEETING ||--o{ TRANSCRIPT : "contains"
    TRANSCRIPT ||--o{ TRANSCRIPT_SEGMENT : "contains"
    
    MEETING ||--o{ MEETING_SUMMARY : "has"
    MEETING ||--o{ TOPIC : "has"
    MEETING ||--o{ DECISION : "records"
    MEETING ||--o{ ACTION_ITEM : "generates"
    MEETING ||--o{ RISK : "identifies"
    MEETING ||--o{ OPEN_QUESTION : "tracks"
    MEETING ||--o{ DOCUMENT : "generates"
    MEETING ||--o{ PROCESSING_JOB : "tracks lifecycle"
    MEETING ||--o{ INTEGRATION_MEETING : "syncs with"
    MEETING ||--o{ EMBEDDING : "has vectors"

    TRANSCRIPT_SEGMENT ||--o{ DECISION : "cites"
    TRANSCRIPT_SEGMENT ||--o{ ACTION_ITEM : "cites"
    TRANSCRIPT_SEGMENT ||--o{ RISK : "cites"
    TRANSCRIPT_SEGMENT ||--o{ OPEN_QUESTION : "cites"
    TRANSCRIPT_SEGMENT ||--o{ EMBEDDING : "vectorized from"

    CHAT_SESSION ||--o{ CHAT_MESSAGE : "contains"
    INTEGRATION ||--o{ INTEGRATION_MEETING : "links"

    ORGANIZATION {
        string id PK
        string name
        string slug UK
        string plan
        datetime created_at
    }

    USER {
        string id PK
        string email UK
        string name
        string status
        datetime created_at
    }

    MEETING {
        string id PK
        string organization_id FK
        string created_by FK
        string title
        string description
        string status
        string source
        string provider
        string provider_meeting_id
        string provider_event_id
        string meeting_url
        datetime start_time
        datetime end_time
        int duration_seconds
    }

    TRANSCRIPT {
        string id PK
        string meeting_id FK
        string source
        string storage_key
        string language
        int version
        string status
    }

    TRANSCRIPT_SEGMENT {
        string id PK
        string transcript_id FK
        string speaker_id
        string speaker_name
        string text
        bigint start_time_ms
        bigint end_time_ms
        int sequence
    }

    ACTION_ITEM {
        string id PK
        string meeting_id FK
        string description
        string assignee_user_id FK
        string assignee_name
        datetime deadline
        string priority
        string status
        string source_segment_id FK
    }

    DECISION {
        string id PK
        string meeting_id FK
        string decision
        string context
        float confidence
        string source_segment_id FK
    }

    RISK {
        string id PK
        string meeting_id FK
        string description
        string severity
        string mitigation
        float confidence
        string source_segment_id FK
    }

    EMBEDDING {
        string id PK
        string organization_id FK
        string meeting_id FK
        string transcript_segment_id FK
        string chunk_text
        vector_768 embedding
        json metadata
    }

    CHAT_SESSION {
        string id PK
        string organization_id FK
        string user_id FK
        string title
        datetime created_at
    }

    CHAT_MESSAGE {
        string id PK
        string session_id FK
        string role
        string content
        json citations
        json relevant_meetings
    }
```

---

### 2.5 Authentication & Dynamic Token Orchestration

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant FE as MeetingOS Frontend
    participant Supabase as Supabase Auth (OAuth)
    participant Nest as NestJS Backend (AuthModule)
    participant Azure as Microsoft Entra ID
    participant DB as PostgreSQL

    User->>FE: Click "Sign in with Microsoft / Google"
    FE->>Supabase: Initiate OAuth flow with provider scopes
    Supabase-->>User: Redirect to Microsoft / Google consent screen
    User->>Supabase: Grant Permissions & Redirect back
    Supabase-->>FE: Return Session with Provider Token & Refresh Token
    
    FE->>Nest: POST /auth/supabase/session (Sync User & Tokens)
    Nest->>Nest: Inspect JWT Claims & Determine Tenant ID
    Nest->>DB: Upsert User & OrganizationMembership
    Nest->>DB: Encrypt & Store Access + Refresh Tokens in `integrations`
    Nest-->>FE: Return MeetingOS JWT + User Profile

    Note over Nest,Azure: Dynamic Token Auto-Refresh with Mutex
    Nest->>Nest: Request API Call -> Token Expired? (or 401 received)
    Nest->>Azure: POST /oauth2/v2.0/token (using dynamic tenant endpoint)
    Azure-->>Nest: Return fresh access_token & refresh_token
    Nest->>DB: Update encrypted tokens in `integrations`
    Nest->>Nest: Retry original Graph / Google API call seamlessly
```

---

## 3. Detailed Component Architecture

### 3.1 Frontend Architecture (`/frontend`)
- **Framework**: React 19 SPA powered by Vite and TypeScript.
- **State Management**: Reactive, split Zustand stores (`auth.store.ts`, `meeting.store.ts`) with zero-overhead re-renders.
- **Styling & UI**: Tailwind CSS, Lucide icons, and accessible modal dialogs with keyboard trapping and screen-reader support.
- **Resilience**:
  - Direct 1-click clipboard copy utility with automatic fallback to `document.execCommand('copy')` for non-HTTPS / legacy contexts.
  - Granular banner feedback for Enterprise vs. Personal accounts.

### 3.2 Backend Core (`/backend`)
- **Framework**: NestJS 10 modular architecture with strict dependency injection.
- **Data Access**: Prisma ORM with `@prisma/client` and custom PostgreSQL vector extensions.
- **Security & Authorization**:
  - Supabase JWT validation guard (`SupabaseAuthGuard`).
  - Role-Based Access Control (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`).
  - Scoped API key authentication (`ApiKeyGuard`) for programmatic integrations.
- **Modular Design**:
  - `AuthModule`: User onboarding, OAuth synchronization, tenant resolution.
  - `MeetingsModule`: Meeting scheduling, CRUD, state machine transitions.
  - `IntegrationsModule`: Google Calendar & Microsoft Graph API dispatch engine with multi-tier fallback.
  - `TranscriptsModule`: Ingestion, diarization mapping, and segment timestamp indexing.
  - `IntelligenceModule`: Google Gemini 1.5 LLM pipeline, prompt engineering, structured JSON extraction.
  - `SearchModule`: Hybrid vector + full-text search leveraging `pgvector` cosine similarity.
  - `DocumentsModule`: Markdown, PDF, and executive briefing compilation.
  - `QueueModule`: RabbitMQ publisher & consumer management with exponential backoff.

### 3.3 Persistence & Vector Engine
- **Relational DB**: PostgreSQL 16 with optimized composite indexing on `[organization_id, status]` and `[organization_id, created_at]`.
- **Vector Search (`pgvector`)**:
  - Dimension: `768` (Google Gemini text-embedding-004 / gecko standard).
  - Search Query: Cosine distance `<->` operator with threshold filtering and tenant isolation (`organization_id = :orgId`).
- **Object Storage**: S3-compatible / Supabase Storage for raw audio files, uploaded `.vtt` transcripts, and generated PDF documents.

---

## 4. Edge Cases & Resilience Strategy Matrix

| Edge Case / Failure Mode | System Impact | Mitigation / Architectural Defense |
| :--- | :--- | :--- |
| **Personal Microsoft Account (Graph 400/401)** | User cannot create calendar events via `/me/onlineMeetings` | **4-Tier Fallback**: Automatically downgrades to direct open Teams room link and provides 1-click bulk attendee email copying. |
| **Token Expiry During Long Operations** | Upstream API calls to Google/Microsoft fail with 401 | **Proactive & Reactive Refresh**: Checks token expiration timestamp prior to requests; intercepts 401s, refreshes via dynamic tenant endpoint, and retries. |
| **RabbitMQ Worker Crash / OOM** | Processing job left in `PROCESSING` status | **Dead Letter Queue & Acknowledgment**: Jobs use manual ACK (`ack` after completion). Unacknowledged messages re-queue with exponential backoff; persistent failures route to DLQ. |
| **Gemini LLM Rate Limiting (429)** | Intelligence extraction temporarily blocked | **Retry with Jitter**: Exponential backoff with random jitter across 3 attempts; fallback to secondary model tier (Gemini 1.5 Flash). |
| **Cross-Tenant Data Leakage** | User queries meetings from another organization | **Tenant Isolation**: Every database query and vector similarity scan mandates `organizationId` matching in Prisma `where` clauses. |
| **Clipboard Copy in Insecure Contexts** | Clipboard API blocked without HTTPS | **Dual-Engine Copy**: Tries modern `navigator.clipboard.writeText`, falls back to hidden `textarea` + `document.execCommand('copy')`. |

---

## 5. Summary & Reference

- **Mermaid Source File**: [docs/architecture/system_design.mmd](file:///Users/aryangautam/Desktop/MeetingOS/docs/architecture/system_design.mmd)
- **Database Schema**: [backend/prisma/schema.prisma](file:///Users/aryangautam/Desktop/MeetingOS/backend/prisma/schema.prisma)
- **Frontend Codebase**: [frontend/src](file:///Users/aryangautam/Desktop/MeetingOS/frontend/src)
- **Backend Codebase**: [backend/src](file:///Users/aryangautam/Desktop/MeetingOS/backend/src)
