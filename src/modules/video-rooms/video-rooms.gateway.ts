import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { VideoRoomsService } from './video-rooms.service';
import { IngestLiveCaptionDto } from './dto/video-rooms.dto';

interface CaptionPayload extends IngestLiveCaptionDto {
  meetingId: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/video-rooms',
})
export class VideoRoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(VideoRoomsGateway.name);

  constructor(private readonly videoRoomsService: VideoRoomsService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to video room gateway: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from video room gateway: ${client.id}`);
  }

  /**
   * Join meeting room channel for live events & captions
   */
  @SubscribeMessage('join_room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { meetingId: string; userId: string; userName: string },
  ) {
    const roomKey = `meeting_${data.meetingId}`;
    client.join(roomKey);
    this.logger.log(`User ${data.userName} (${data.userId}) joined gateway room ${roomKey}`);

    // Broadcast presence update to room
    client.to(roomKey).emit('user_joined_call', {
      userId: data.userId,
      userName: data.userName,
      timestamp: Date.now(),
    });

    return { status: 'joined', room: roomKey };
  }

  /**
   * Leave meeting room channel
   */
  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { meetingId: string; userId: string; userName: string },
  ) {
    const roomKey = `meeting_${data.meetingId}`;
    client.leave(roomKey);

    client.to(roomKey).emit('user_left_call', {
      userId: data.userId,
      userName: data.userName,
      timestamp: Date.now(),
    });

    return { status: 'left' };
  }

  /**
   * Broadcast and persist live caption/transcript stream
   */
  @SubscribeMessage('send_caption')
  async handleSendCaption(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: CaptionPayload,
  ) {
    const roomKey = `meeting_${data.meetingId}`;

    // 1. Immediately broadcast live caption to all participants in the room
    this.server.to(roomKey).emit('live_caption', {
      speakerId: data.speakerId,
      speakerName: data.speakerName,
      text: data.text,
      isInterim: !!data.isInterim,
      startTimeMs: data.startTimeMs,
      endTimeMs: data.endTimeMs,
      timestamp: Date.now(),
    });

    // 2. If it is a finalized segment, persist to database asynchronously
    if (!data.isInterim && data.text.trim().length > 0) {
      try {
        await this.videoRoomsService.ingestCaption(data.meetingId, {
          speakerId: data.speakerId,
          speakerName: data.speakerName,
          text: data.text,
          startTimeMs: data.startTimeMs,
          endTimeMs: data.endTimeMs,
          isInterim: false,
        });
      } catch (err) {
        this.logger.error(`Failed to persist live caption segment: ${err.message}`);
      }
    }

    return { received: true };
  }

  /**
   * In-room reaction / chat message
   */
  @SubscribeMessage('send_reaction')
  handleReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { meetingId: string; userId: string; userName: string; emoji: string },
  ) {
    const roomKey = `meeting_${data.meetingId}`;
    this.server.to(roomKey).emit('live_reaction', {
      userId: data.userId,
      userName: data.userName,
      emoji: data.emoji,
      timestamp: Date.now(),
    });
    return { status: 'sent' };
  }
}
