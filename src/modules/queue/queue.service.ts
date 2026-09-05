import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import {
  RABBITMQ_EXCHANGES,
  RABBITMQ_QUEUES,
  RABBITMQ_ROUTING_KEYS,
  QUEUE_CONFIG,
} from './queue.constants';

export interface QueueJobMessage<T = any> {
  id: string;
  meetingId: string;
  jobType: string;
  organizationId: string;
  payload: T;
  timestamp: string;
}

export interface QueueStats {
  connected: boolean;
  queues: {
    name: string;
    messageCount: number;
    consumerCount: number;
  }[];
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private isConnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initConnection();
  }

  async onModuleDestroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('RabbitMQ connection closed gracefully.');
    } catch (err: any) {
      this.logger.warn(`Error during RabbitMQ shutdown: ${err.message}`);
    }
  }

  /**
   * Initializes resilient connection with automatic retry on disconnect
   */
  private async initConnection() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    const rabbitmqUrl =
      this.configService.get<string>('RABBITMQ_URL') ||
      'amqp://meetingos:meetingos_pass@localhost:5672';

    try {
      this.logger.log('Connecting to RabbitMQ broker...');
      this.connection = await amqp.connect(rabbitmqUrl);

      this.connection.on('error', (err) => {
        this.logger.error(`RabbitMQ connection error: ${err.message}`);
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed. Attempting reconnect...');
        this.handleDisconnect();
      });

      this.channel = await this.connection.createChannel();
      await this.channel.prefetch(5);

      // Assert complete topology: Exchanges, Primary Queues, Retry Queue, DLQ
      await this.assertTopology();

      this.logger.log('RabbitMQ connected and topology asserted successfully.');
      this.isConnecting = false;
    } catch (error: any) {
      this.logger.warn(
        `RabbitMQ connection failed: ${error.message}. Retrying in 5s...`,
      );
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private handleDisconnect() {
    this.channel = null;
    this.connection = null;
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initConnection();
    }, 5000);
  }

  /**
   * Industry-grade exchange and queue topology setup with Retry Exchange & DLQ
   */
  private async assertTopology() {
    if (!this.channel) return;

    // 1. Declare Exchanges (Durable Direct)
    await this.channel.assertExchange(RABBITMQ_EXCHANGES.PRIMARY, 'direct', {
      durable: true,
    });
    await this.channel.assertExchange(RABBITMQ_EXCHANGES.RETRY, 'direct', {
      durable: true,
    });
    await this.channel.assertExchange(RABBITMQ_EXCHANGES.DLX, 'direct', {
      durable: true,
    });

    // 2. Declare Dead-Letter Queue (DLQ)
    await this.channel.assertQueue(RABBITMQ_QUEUES.DLQ, {
      durable: true,
    });
    await this.channel.bindQueue(
      RABBITMQ_QUEUES.DLQ,
      RABBITMQ_EXCHANGES.DLX,
      RABBITMQ_ROUTING_KEYS.DLQ_DEFAULT,
    );
    await this.channel.bindQueue(
      RABBITMQ_QUEUES.DLQ,
      RABBITMQ_EXCHANGES.DLX,
      'job.transcription',
    );
    await this.channel.bindQueue(
      RABBITMQ_QUEUES.DLQ,
      RABBITMQ_EXCHANGES.DLX,
      'job.intelligence',
    );
    await this.channel.bindQueue(
      RABBITMQ_QUEUES.DLQ,
      RABBITMQ_EXCHANGES.DLX,
      'job.document',
    );

    // 3. Declare Delayed Retry Queue with TTL & Re-route back to PRIMARY Exchange
    await this.channel.assertQueue(RABBITMQ_QUEUES.RETRY, {
      durable: true,
      deadLetterExchange: RABBITMQ_EXCHANGES.PRIMARY, // On TTL expiry, dead-letters back to Primary Exchange
      messageTtl: QUEUE_CONFIG.DEFAULT_RETRY_DELAY_MS, // 10s delay backoff
    });

    // Bind retry queue to retry exchange for all job types
    await this.channel.bindQueue(
      RABBITMQ_QUEUES.RETRY,
      RABBITMQ_EXCHANGES.RETRY,
      RABBITMQ_ROUTING_KEYS.TRANSCRIPTION,
    );
    await this.channel.bindQueue(
      RABBITMQ_QUEUES.RETRY,
      RABBITMQ_EXCHANGES.RETRY,
      RABBITMQ_ROUTING_KEYS.INTELLIGENCE,
    );
    await this.channel.bindQueue(
      RABBITMQ_QUEUES.RETRY,
      RABBITMQ_EXCHANGES.RETRY,
      RABBITMQ_ROUTING_KEYS.DOCUMENT,
    );

    // 4. Declare Primary Work Queues (With Dead-Letter Exchange pointing to RETRY Exchange)
    const primaryQueueConfigs = [
      {
        name: RABBITMQ_QUEUES.TRANSCRIPTION,
        routingKey: RABBITMQ_ROUTING_KEYS.TRANSCRIPTION,
      },
      {
        name: RABBITMQ_QUEUES.INTELLIGENCE,
        routingKey: RABBITMQ_ROUTING_KEYS.INTELLIGENCE,
      },
      {
        name: RABBITMQ_QUEUES.DOCUMENT,
        routingKey: RABBITMQ_ROUTING_KEYS.DOCUMENT,
      },
    ];

    for (const queueConfig of primaryQueueConfigs) {
      await this.channel.assertQueue(queueConfig.name, {
        durable: true,
        deadLetterExchange: RABBITMQ_EXCHANGES.RETRY,
        deadLetterRoutingKey: queueConfig.routingKey,
      });

      await this.channel.bindQueue(
        queueConfig.name,
        RABBITMQ_EXCHANGES.PRIMARY,
        queueConfig.routingKey,
      );
    }
  }

  /**
   * Publishes a job to the Primary Exchange with tracking metadata
   */
  async publishJob<T = any>(
    routingKey: string,
    payload: T,
    options?: {
      messageId?: string;
      correlationId?: string;
      headers?: Record<string, any>;
    },
  ): Promise<boolean> {
    if (!this.channel) {
      this.logger.warn(
        `Cannot publish to ${routingKey}: RabbitMQ channel not connected.`,
      );
      return false;
    }

    try {
      const messageBuffer = Buffer.from(JSON.stringify(payload));
      const headers = {
        'x-retry-count': 0,
        'x-original-routing-key': routingKey,
        'x-published-at': new Date().toISOString(),
        ...(options?.headers || {}),
      };

      const published = this.channel.publish(
        RABBITMQ_EXCHANGES.PRIMARY,
        routingKey,
        messageBuffer,
        {
          persistent: true,
          contentType: 'application/json',
          messageId: options?.messageId,
          correlationId: options?.correlationId,
          headers,
        },
      );

      this.logger.log(
        `Job published to [${RABBITMQ_EXCHANGES.PRIMARY} -> ${routingKey}] ID: ${options?.messageId || 'auto'}`,
      );
      return published;
    } catch (err: any) {
      this.logger.error(
        `Failed to publish job to ${routingKey}: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Manually routes an unrecoverable or max-retry message to the Dead-Letter Queue (DLQ)
   */
  async publishToDLQ<T = any>(
    routingKey: string,
    payload: T,
    reason: string,
    headers?: Record<string, any>,
  ): Promise<boolean> {
    if (!this.channel) return false;

    try {
      const messageBuffer = Buffer.from(JSON.stringify(payload));
      const dlqHeaders = {
        ...headers,
        'x-death-reason': reason,
        'x-dead-lettered-at': new Date().toISOString(),
      };

      return this.channel.publish(
        RABBITMQ_EXCHANGES.DLX,
        routingKey || RABBITMQ_ROUTING_KEYS.DLQ_DEFAULT,
        messageBuffer,
        {
          persistent: true,
          contentType: 'application/json',
          headers: dlqHeaders,
        },
      );
    } catch (err: any) {
      this.logger.error(`Failed to publish to DLQ: ${err.message}`);
      return false;
    }
  }

  /**
   * Consumes messages from a specific queue with automated retry & DLQ handling
   */
  async consumeQueue<T = any>(
    queueName: string,
    handler: (data: T, msg: amqp.ConsumeMessage) => Promise<void>,
    options?: { maxRetries?: number },
  ) {
    if (!this.channel) {
      this.logger.warn(
        `Cannot consume ${queueName}: RabbitMQ channel not available.`,
      );
      return;
    }

    const maxRetries =
      options?.maxRetries ?? QUEUE_CONFIG.DEFAULT_MAX_RETRIES;

    await this.channel.consume(
      queueName,
      async (msg) => {
        if (!msg) return;

        let content: T;
        try {
          content = JSON.parse(msg.content.toString());
        } catch (parseErr: any) {
          this.logger.error(
            `Poison message in ${queueName} (invalid JSON): ${parseErr.message}. Moving to DLQ.`,
          );
          // Route immediately to DLQ without wasting retries
          await this.publishToDLQ(
            msg.fields.routingKey,
            { rawContent: msg.content.toString() },
            'Invalid JSON payload',
            msg.properties.headers,
          );
          this.channel?.ack(msg);
          return;
        }

        const currentRetryCount =
          (msg.properties.headers?.['x-retry-count'] as number) || 0;

        try {
          // Execute handler
          await handler(content, msg);
          this.channel?.ack(msg);
        } catch (processError: any) {
          this.logger.error(
            `Error processing job from ${queueName} (Attempt ${currentRetryCount + 1}/${maxRetries}): ${processError.message}`,
          );

          if (currentRetryCount + 1 >= maxRetries) {
            this.logger.error(
              `Job exceeded max retries (${maxRetries}). Escalating to DLQ: [${RABBITMQ_QUEUES.DLQ}]`,
            );
            await this.publishToDLQ(
              msg.fields.routingKey,
              content,
              `Exceeded max retries (${maxRetries}): ${processError.message}`,
              {
                ...msg.properties.headers,
                'x-retry-count': currentRetryCount + 1,
              },
            );
            this.channel?.ack(msg); // Acknowledge to remove from primary cycle
          } else {
            // Forward to Retry Exchange with updated retry count header
            this.logger.warn(
              `Routing job to [${RABBITMQ_EXCHANGES.RETRY}] for 10s backoff delay.`,
            );
            this.channel?.publish(
              RABBITMQ_EXCHANGES.RETRY,
              msg.fields.routingKey,
              msg.content,
              {
                persistent: true,
                contentType: 'application/json',
                headers: {
                  ...msg.properties.headers,
                  'x-retry-count': currentRetryCount + 1,
                  'x-last-error': processError.message,
                  'x-last-attempt-at': new Date().toISOString(),
                },
              },
            );
            this.channel?.ack(msg);
          }
        }
      },
      { noAck: false },
    );

    this.logger.log(`Active consumer attached to queue: [${queueName}]`);
  }

  /**
   * Retrieves queue depth statistics and broker connection health
   */
  async getQueueStats(): Promise<QueueStats> {
    const queueList = [
      RABBITMQ_QUEUES.TRANSCRIPTION,
      RABBITMQ_QUEUES.INTELLIGENCE,
      RABBITMQ_QUEUES.DOCUMENT,
      RABBITMQ_QUEUES.RETRY,
      RABBITMQ_QUEUES.DLQ,
    ];

    if (!this.channel) {
      return {
        connected: false,
        queues: queueList.map((name) => ({
          name,
          messageCount: 0,
          consumerCount: 0,
        })),
      };
    }

    const queueStats = await Promise.all(
      queueList.map(async (queueName) => {
        try {
          const info = await this.channel?.checkQueue(queueName);
          return {
            name: queueName,
            messageCount: info?.messageCount || 0,
            consumerCount: info?.consumerCount || 0,
          };
        } catch {
          return {
            name: queueName,
            messageCount: 0,
            consumerCount: 0,
          };
        }
      }),
    );

    return {
      connected: true,
      queues: queueStats,
    };
  }

  /**
   * Replays dead-lettered messages from meetingos.dlq back into primary exchange
   */
  async replayDLQ(limit = 10): Promise<{ replayedCount: number }> {
    if (!this.channel) return { replayedCount: 0 };

    let replayed = 0;
    for (let i = 0; i < limit; i++) {
      const msg = await this.channel.get(RABBITMQ_QUEUES.DLQ, { noAck: false });
      if (!msg) break;

      try {
        const content = JSON.parse(msg.content.toString());
        const originalRoutingKey =
          (msg.properties.headers?.['x-original-routing-key'] as string) ||
          RABBITMQ_ROUTING_KEYS.INTELLIGENCE;

        // Reset retry count on manual replay
        await this.publishJob(originalRoutingKey, content, {
          headers: {
            'x-retry-count': 0,
            'x-replayed-from-dlq-at': new Date().toISOString(),
          },
        });

        this.channel.ack(msg);
        replayed++;
      } catch (err: any) {
        this.logger.error(`Error replaying DLQ message: ${err.message}`);
        this.channel.nack(msg, false, true);
        break;
      }
    }

    return { replayedCount: replayed };
  }

  /**
   * Purges all messages from the Dead-Letter Queue
   */
  async purgeDLQ(): Promise<{ purgedCount: number }> {
    if (!this.channel) return { purgedCount: 0 };

    try {
      const result = await this.channel.purgeQueue(RABBITMQ_QUEUES.DLQ);
      return { purgedCount: result.messageCount };
    } catch (err: any) {
      this.logger.error(`Failed to purge DLQ: ${err.message}`);
      return { purgedCount: 0 };
    }
  }
}
