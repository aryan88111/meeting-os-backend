import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface RAGCitation {
  meetingId: string;
  meetingTitle: string;
  speakerName?: string;
  timestampStartMs?: number;
  timestampFormatted?: string;
  snippet: string;
  type: 'DECISION' | 'ACTION_ITEM' | 'TRANSCRIPT' | 'SUMMARY' | 'TOPIC';
}

export interface RAGAnswerResponse {
  answer: string;
  citations: RAGCitation[];
  relevantMeetings: Array<{
    id: string;
    title: string;
    date?: string;
    summary?: string;
  }>;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search across meetings, summaries, decisions, and action items
   */
  async searchMeetings(query: string, organizationId?: string) {
    if (!query || !query.trim()) {
      return [];
    }

    const cleanQuery = query.trim();

    return this.prisma.meeting.findMany({
      where: {
        isActive: true,
        ...(organizationId ? { organizationId } : {}),
        OR: [
          { title: { contains: cleanQuery, mode: 'insensitive' } },
          { description: { contains: cleanQuery, mode: 'insensitive' } },
          {
            summaries: {
              some: {
                OR: [
                  { executiveSummary: { contains: cleanQuery, mode: 'insensitive' } },
                  { summary: { contains: cleanQuery, mode: 'insensitive' } },
                ],
              },
            },
          },
          {
            decisions: {
              some: {
                OR: [
                  { decision: { contains: cleanQuery, mode: 'insensitive' } },
                  { context: { contains: cleanQuery, mode: 'insensitive' } },
                ],
              },
            },
          },
          {
            actionItems: {
              some: {
                description: { contains: cleanQuery, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      include: {
        summaries: { take: 1, orderBy: { createdAt: 'desc' } },
        decisions: { take: 3 },
        actionItems: { take: 3 },
        participants: true,
      },
      take: 20,
    });
  }

  /**
   * RAG Knowledge Base Q&A across all organization meetings
   */
  async askKnowledgeBase(query: string, organizationId?: string): Promise<RAGAnswerResponse> {
    const cleanQuery = query.trim().toLowerCase();
    const queryTokens = cleanQuery
      .replace(/[?.,!]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !['what', 'when', 'where', 'which', 'who', 'how', 'happened', 'about', 'this', 'that', 'with', 'from', 'have', 'were', 'your', 'team'].includes(t));

    // 1. Fetch relevant meetings and their structured intelligence
    const meetings = await this.prisma.meeting.findMany({
      where: {
        isActive: true,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        summaries: { take: 1, orderBy: { createdAt: 'desc' } },
        decisions: {
          include: { sourceSegment: true },
        },
        actionItems: {
          include: { sourceSegment: true, assignee: true },
        },
        topics: true,
        transcripts: {
          include: {
            segments: {
              take: 100,
              orderBy: { sequence: 'asc' },
            },
          },
        },
      },
      orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
      take: 25,
    });

    if (meetings.length === 0) {
      return {
        answer: "I couldn't find any meetings in your organization knowledge base to answer this question. Please upload transcripts or sync your calendar first.",
        citations: [],
        relevantMeetings: [],
      };
    }

    const citations: RAGCitation[] = [];
    const matchingPoints: string[] = [];
    const relevantMeetingsMap = new Map<string, { id: string; title: string; date?: string; summary?: string }>();

    const formatTime = (ms?: bigint | number | null) => {
      if (!ms) return '00:00';
      const totalSec = Math.floor(Number(ms) / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const isLastMeetingQuery = cleanQuery.includes('last meeting') || cleanQuery.includes('recent meeting') || cleanQuery.includes('latest meeting') || cleanQuery.includes('what happened');

    // If query asks for the latest/last meeting specifically
    if (isLastMeetingQuery) {
      const latest = meetings[0];
      const meetingDateStr = latest.startTime
        ? new Date(latest.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : new Date(latest.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      relevantMeetingsMap.set(latest.id, {
        id: latest.id,
        title: latest.title,
        date: meetingDateStr,
        summary: latest.summaries[0]?.executiveSummary || 'Discussion completed.',
      });

      if (latest.summaries.length > 0) {
        citations.push({
          meetingId: latest.id,
          meetingTitle: latest.title,
          snippet: latest.summaries[0].executiveSummary.slice(0, 160) + '...',
          type: 'SUMMARY',
        });
      }

      for (const d of latest.decisions.slice(0, 3)) {
        matchingPoints.push(`- **Decision**: ${d.decision}${d.context ? ` (*${d.context}*)` : ''}`);
        citations.push({
          meetingId: latest.id,
          meetingTitle: latest.title,
          speakerName: d.sourceSegment?.speakerName || 'Speaker',
          timestampStartMs: d.sourceSegment?.startTimeMs ? Number(d.sourceSegment.startTimeMs) : undefined,
          timestampFormatted: formatTime(d.sourceSegment?.startTimeMs),
          snippet: d.decision,
          type: 'DECISION',
        });
      }

      for (const a of latest.actionItems.slice(0, 3)) {
        matchingPoints.push(`- **Action**: ${a.description} (Assignee: ${a.assignee?.name || a.assigneeName || 'Unassigned'})`);
        citations.push({
          meetingId: latest.id,
          meetingTitle: latest.title,
          speakerName: a.sourceSegment?.speakerName || 'Speaker',
          timestampStartMs: a.sourceSegment?.startTimeMs ? Number(a.sourceSegment.startTimeMs) : undefined,
          timestampFormatted: formatTime(a.sourceSegment?.startTimeMs),
          snippet: a.description,
          type: 'ACTION_ITEM',
        });
      }

      const summaryText = latest.summaries[0]?.executiveSummary 
        ? `In your most recent meeting **"${latest.title}"** (${meetingDateStr}):\n\n${latest.summaries[0].executiveSummary}\n\n`
        : `In your most recent meeting **"${latest.title}"** (${meetingDateStr}):\n\n`;

      const bulletSection = matchingPoints.length > 0
        ? `### Key Decisions & Actions:\n${matchingPoints.join('\n\n')}`
        : '';

      return {
        answer: `${summaryText}${bulletSection}`.trim(),
        citations,
        relevantMeetings: Array.from(relevantMeetingsMap.values()),
      };
    }

    // General token-based matching across all meetings
    for (const meeting of meetings) {
      const meetingDateStr = meeting.startTime
        ? new Date(meeting.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : new Date(meeting.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      // Check Decisions
      for (const d of meeting.decisions) {
        const textToMatch = `${d.decision} ${d.context || ''}`.toLowerCase();
        const matchesToken = queryTokens.some((tok) => textToMatch.includes(tok));
        if (matchesToken) {
          matchingPoints.push(`- **Decision in "${meeting.title}"**: ${d.decision}${d.context ? ` (*${d.context}*)` : ''}`);
          citations.push({
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            speakerName: d.sourceSegment?.speakerName || 'Speaker',
            timestampStartMs: d.sourceSegment?.startTimeMs ? Number(d.sourceSegment.startTimeMs) : undefined,
            timestampFormatted: formatTime(d.sourceSegment?.startTimeMs),
            snippet: d.decision,
            type: 'DECISION',
          });
          relevantMeetingsMap.set(meeting.id, {
            id: meeting.id,
            title: meeting.title,
            date: meetingDateStr,
            summary: meeting.summaries[0]?.executiveSummary,
          });
        }
      }

      // Check Action Items
      for (const a of meeting.actionItems) {
        const textToMatch = `${a.description} ${a.assigneeName || ''}`.toLowerCase();
        const matchesToken = queryTokens.some((tok) => textToMatch.includes(tok));
        if (matchesToken) {
          matchingPoints.push(`- **Action Item**: ${a.description} (Assignee: ${a.assignee?.name || a.assigneeName || 'Unassigned'}, Status: ${a.status})`);
          citations.push({
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            speakerName: a.sourceSegment?.speakerName || 'Speaker',
            timestampStartMs: a.sourceSegment?.startTimeMs ? Number(a.sourceSegment.startTimeMs) : undefined,
            timestampFormatted: formatTime(a.sourceSegment?.startTimeMs),
            snippet: a.description,
            type: 'ACTION_ITEM',
          });
          relevantMeetingsMap.set(meeting.id, {
            id: meeting.id,
            title: meeting.title,
            date: meetingDateStr,
            summary: meeting.summaries[0]?.executiveSummary,
          });
        }
      }

      // Check Summaries
      if (meeting.summaries.length > 0) {
        const s = meeting.summaries[0];
        const textToMatch = `${s.executiveSummary} ${s.summary}`.toLowerCase();
        const matchesToken = queryTokens.some((tok) => textToMatch.includes(tok));
        if (matchesToken) {
          relevantMeetingsMap.set(meeting.id, {
            id: meeting.id,
            title: meeting.title,
            date: meetingDateStr,
            summary: s.executiveSummary,
          });
          citations.push({
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            snippet: s.executiveSummary.slice(0, 160) + '...',
            type: 'SUMMARY',
          });
        }
      }

      // Check Transcript Segments
      for (const transcript of meeting.transcripts) {
        for (const seg of transcript.segments) {
          const segText = seg.text.toLowerCase();
          const matches = queryTokens.filter((tok) => segText.includes(tok));
          if (matches.length >= Math.min(2, queryTokens.length) && queryTokens.length > 0) {
            citations.push({
              meetingId: meeting.id,
              meetingTitle: meeting.title,
              speakerName: seg.speakerName || 'Participant',
              timestampStartMs: seg.startTimeMs ? Number(seg.startTimeMs) : undefined,
              timestampFormatted: formatTime(seg.startTimeMs),
              snippet: seg.text,
              type: 'TRANSCRIPT',
            });
            relevantMeetingsMap.set(meeting.id, {
              id: meeting.id,
              title: meeting.title,
              date: meetingDateStr,
              summary: meeting.summaries[0]?.executiveSummary,
            });
            if (citations.length >= 6) break;
          }
        }
      }
    }

    // 3. Compose structured answer
    let answerText = '';
    const relevantMeetingsList = Array.from(relevantMeetingsMap.values());

    if (matchingPoints.length > 0) {
      answerText = `Based on your team's meeting discussions, here is what was found:\n\n${matchingPoints.slice(0, 5).join('\n\n')}`;
    } else if (relevantMeetingsList.length > 0) {
      const top = relevantMeetingsList[0];
      answerText = `In **"${top.title}"** (${top.date}):\n\n${top.summary || 'Relevant discussions were recorded in the meeting transcript.'}`;
    } else {
      const latest = meetings[0];
      answerText = `I analyzed **${meetings.length} meeting sessions**. While no exact match for "${query}" was found in recorded decisions, the most recent meeting is **"${latest.title}"** where the team covered: ${latest.summaries[0]?.executiveSummary || 'general project topics'}.`;
    }

    return {
      answer: answerText,
      citations: citations.slice(0, 8),
      relevantMeetings: relevantMeetingsList.slice(0, 4),
    };
  }
}
