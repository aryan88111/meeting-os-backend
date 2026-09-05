// Roles and Permissions
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type ActionItemStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type MeetingStatus =
  | 'CREATED'
  | 'WAITING_FOR_TRANSCRIPT'
  | 'TRANSCRIPT_RECEIVED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'AI_COMPLETED'
  | 'DOCUMENT_GENERATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'FAILED_PERMANENT';

export type MeetingSource = 'MANUAL' | 'GOOGLE_MEET' | 'MICROSOFT_TEAMS' | 'ZOOM';

export type DocumentType = 'HTML' | 'PDF' | 'DOCX';

export type JobType = 'TRANSCRIPT_PROCESSING' | 'DOCUMENT_GENERATION' | 'EMBEDDING_GENERATION';

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// Canonical Transcript Segment Model
export interface TranscriptSegment {
  id?: string;
  speakerId?: string;
  speakerName?: string;
  text: string;
  startTimeMs?: number;
  endTimeMs?: number;
  confidence?: number;
  sequence: number;
}

// AI Extracted Output Schema
export interface ExtractedTopic {
  title: string;
  summary: string;
  importance: number;
}

export interface ExtractedDecision {
  decision: string;
  context?: string;
  confidence: number;
  sourceSegmentId?: string;
}

export interface ExtractedActionItem {
  description: string;
  assigneeName?: string;
  deadline?: string;
  priority: Priority;
  status: ActionItemStatus;
  sourceSegmentId?: string;
}

export interface ExtractedRisk {
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  sourceSegmentId?: string;
}

export interface ExtractedOpenQuestion {
  question: string;
  owner?: string;
  resolved: boolean;
  sourceSegmentId?: string;
}

export interface MeetingIntelligence {
  executiveSummary: string;
  summary: string;
  topics: ExtractedTopic[];
  decisions: ExtractedDecision[];
  actionItems: ExtractedActionItem[];
  risks: ExtractedRisk[];
  openQuestions: ExtractedOpenQuestion[];
}

// RabbitMQ Job Payloads
export interface TranscriptProcessingJobPayload {
  jobId: string;
  meetingId: string;
  organizationId: string;
  transcriptId: string;
  source: MeetingSource;
  attempt: number;
}

export interface DocumentGenerationJobPayload {
  jobId: string;
  meetingId: string;
  organizationId: string;
  documentType: DocumentType;
  version: number;
}

export interface EmbeddingGenerationJobPayload {
  jobId: string;
  meetingId: string;
  organizationId: string;
  transcriptId: string;
}

// Provider Adapter Interfaces
export interface ProviderMeeting {
  id: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  participants: Array<{ name: string; email?: string }>;
}

export interface ProviderTranscript {
  id: string;
  meetingId: string;
  segments: TranscriptSegment[];
}

export interface MeetingProvider {
  listMeetings(): Promise<ProviderMeeting[]>;
  getMeeting(id: string): Promise<ProviderMeeting>;
  listTranscripts(meetingId: string): Promise<ProviderTranscript[]>;
  getTranscript(meetingId: string, transcriptId: string): Promise<ProviderTranscript>;
}
