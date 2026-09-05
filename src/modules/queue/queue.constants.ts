export const RABBITMQ_EXCHANGES = {
  PRIMARY: 'meetingos.direct',
  RETRY: 'meetingos.retry.exchange',
  DLX: 'meetingos.dlx',
} as const;

export const RABBITMQ_QUEUES = {
  TRANSCRIPTION: 'meetingos.transcription',
  INTELLIGENCE: 'meetingos.intelligence',
  DOCUMENT: 'meetingos.document',
  RETRY: 'meetingos.retry.queue',
  DLQ: 'meetingos.dlq',
} as const;

export const RABBITMQ_ROUTING_KEYS = {
  TRANSCRIPTION: 'job.transcription',
  INTELLIGENCE: 'job.intelligence',
  DOCUMENT: 'job.document',
  RETRY_PATTERN: 'retry.#',
  DLQ_PATTERN: 'dlq.#',
  DLQ_DEFAULT: 'dlq.job',
} as const;

export const QUEUE_CONFIG = {
  DEFAULT_MAX_RETRIES: 3,
  DEFAULT_RETRY_DELAY_MS: 10000, // 10 seconds backoff delay
} as const;
