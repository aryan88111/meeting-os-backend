import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchService, RAGAnswerResponse } from './search.service';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: SearchService,
  ) {}

  /**
   * List all chat sessions for the active organization & user
   */
  async listSessions(organizationId: string, userId: string) {
    return this.prisma.chatSession.findMany({
      where: {
        organizationId,
        userId,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  /**
   * Get single chat session with complete message history
   */
  async getSession(organizationId: string, userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        organizationId,
        userId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    return session;
  }

  /**
   * Send a question within an existing or new session and persist answer
   */
  async askInSession(
    organizationId: string,
    userId: string,
    query: string,
    sessionId?: string,
  ): Promise<{
    session: { id: string; title: string };
    userMessage: any;
    assistantMessage: any;
  }> {
    let currentSessionId = sessionId;
    let sessionTitle = 'New Conversation';

    // 1. Create or retrieve session
    if (!currentSessionId) {
      // Auto-generate a clean title from the initial query
      const cleanTitle = query.trim().slice(0, 45).replace(/[?.,!]/g, '');
      sessionTitle = cleanTitle ? cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1) : 'New Conversation';

      const newSession = await this.prisma.chatSession.create({
        data: {
          organizationId,
          userId,
          title: sessionTitle,
        },
      });
      currentSessionId = newSession.id;
    } else {
      const existing = await this.prisma.chatSession.findFirst({
        where: { id: currentSessionId, organizationId, userId },
      });
      if (!existing) {
        throw new NotFoundException('Chat session not found');
      }
      sessionTitle = existing.title;
    }

    // 2. Persist User Message
    const userMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId: currentSessionId,
        role: 'user',
        content: query.trim(),
      },
    });

    // 3. Query RAG engine
    const ragResult: RAGAnswerResponse = await this.searchService.askKnowledgeBase(
      query,
      organizationId,
    );

    // 4. Persist Assistant Message with citations & relevant meetings
    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId: currentSessionId,
        role: 'assistant',
        content: ragResult.answer,
        citations: (ragResult.citations as any) || [],
        relevantMeetings: (ragResult.relevantMeetings as any) || [],
      },
    });

    // 5. Touch session updatedAt
    await this.prisma.chatSession.update({
      where: { id: currentSessionId },
      data: { updatedAt: new Date() },
    });

    return {
      session: {
        id: currentSessionId,
        title: sessionTitle,
      },
      userMessage,
      assistantMessage,
    };
  }

  /**
   * Rename session title
   */
  async renameSession(
    organizationId: string,
    userId: string,
    sessionId: string,
    title: string,
  ) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, organizationId, userId },
    });

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    return this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { title: title.trim() },
    });
  }

  /**
   * Delete chat session and cascade messages
   */
  async deleteSession(organizationId: string, userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, organizationId, userId },
    });

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    await this.prisma.chatSession.delete({
      where: { id: sessionId },
    });

    return { success: true, message: 'Chat session deleted successfully' };
  }
}
