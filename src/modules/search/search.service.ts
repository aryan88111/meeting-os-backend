import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface RAGCitation {
  meetingId: string;
  meetingTitle: string;
  speakerName?: string;
  timestampStartMs?: number;
  timestampFormatted?: string;
  snippet: string;
  type: 'DECISION' | 'ACTION_ITEM' | 'TRANSCRIPT' | 'SUMMARY' | 'TOPIC' | 'RISK' | 'OPEN_QUESTION';
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

interface AIMeetingContext {
  id: string;
  title: string;
  date?: string;
  executive_summary?: string;
  summary?: string;
  risks?: Array<{ description: string; severity: string; mitigation?: string | null }>;
  decisions?: Array<{ decision: string; context?: string | null; confidence?: number }>;
  action_items?: Array<{ description: string; assigneeName?: string | null; status?: string; priority?: string }>;
  topics?: Array<{ title: string; summary: string; importance: number }>;
  open_questions?: Array<{ question: string; assignedTo?: string | null; status?: string | null }>;
  transcript_snippets?: Array<{ speakerName?: string | null; text: string; startTimeMs?: number }>;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search across meetings, summaries, decisions, action items, risks, and topics
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
          {
            risks: {
              some: {
                OR: [
                  { description: { contains: cleanQuery, mode: 'insensitive' } },
                  { mitigation: { contains: cleanQuery, mode: 'insensitive' } },
                ],
              },
            },
          },
          {
            topics: {
              some: {
                OR: [
                  { title: { contains: cleanQuery, mode: 'insensitive' } },
                  { summary: { contains: cleanQuery, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      },
      include: {
        summaries: { take: 1, orderBy: { createdAt: 'desc' } },
        decisions: { take: 3 },
        actionItems: { take: 3 },
        risks: { take: 3 },
        topics: { take: 3 },
        participants: true,
      },
      take: 20,
    });
  }

  /**
   * RAG Knowledge Base Q&A across all organization meetings with AI-service integration
   */
  async askKnowledgeBase(query: string, organizationId?: string): Promise<RAGAnswerResponse> {
    const cleanQuery = query.trim().toLowerCase();
    const queryTokens = cleanQuery
      .replace(/[?.,!]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !['what', 'when', 'where', 'which', 'who', 'how', 'happened', 'about', 'this', 'that', 'with', 'from', 'have', 'were', 'your', 'team', 'only', 'meeting', 'meetings'].includes(t));

    // 1. Fetch full-spectrum meeting intelligence across the workspace
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
        risks: {
          include: { sourceSegment: true },
        },
        openQuestions: {
          include: { sourceSegment: true },
        },
        topics: true,
        transcripts: {
          include: {
            segments: {
              take: 120,
              orderBy: { sequence: 'asc' },
            },
          },
        },
      },
      orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
      take: 30,
    });

    if (meetings.length === 0) {
      return {
        answer: "I couldn't find any meetings in your organization knowledge base to answer this question. Please upload transcripts or sync your calendar first.",
        citations: [],
        relevantMeetings: [],
      };
    }

    const citations: RAGCitation[] = [];
    const relevantMeetingsMap = new Map<string, { id: string; title: string; date?: string; summary?: string }>();

    const formatTime = (ms?: bigint | number | null) => {
      if (!ms) return '00:00';
      const totalSec = Math.floor(Number(ms) / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    // Format meeting contexts for AI microservice
    const meetingContexts: AIMeetingContext[] = meetings.map((m) => {
      const dateStr = m.startTime
        ? new Date(m.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      // Gather snippets from transcript
      const snippets = m.transcripts.flatMap((t) =>
        t.segments.slice(0, 15).map((s) => ({
          speakerName: s.speakerName,
          text: s.text,
          startTimeMs: s.startTimeMs ? Number(s.startTimeMs) : undefined,
        }))
      );

      return {
        id: m.id,
        title: m.title,
        date: dateStr,
        executive_summary: m.summaries[0]?.executiveSummary,
        summary: m.summaries[0]?.summary,
        risks: m.risks.map((r) => ({
          description: r.description,
          severity: r.severity,
          mitigation: r.mitigation,
        })),
        decisions: m.decisions.map((d) => ({
          decision: d.decision,
          context: d.context,
          confidence: d.confidence,
        })),
        action_items: m.actionItems.map((a) => ({
          description: a.description,
          assigneeName: a.assignee?.name || a.assigneeName,
          status: a.status,
          priority: a.priority,
        })),
        topics: m.topics.map((top) => ({
          title: top.title,
          summary: top.summary,
          importance: top.importance,
        })),
        open_questions: m.openQuestions.map((q) => ({
          question: q.question,
          assignedTo: q.assignedTo,
          status: q.status,
        })),
        transcript_snippets: snippets,
      };
    });

    // Extract citations across all intelligence dimensions
    const isRiskQuery = cleanQuery.includes('risk') || cleanQuery.includes('danger') || cleanQuery.includes('blocker') || cleanQuery.includes('issue') || cleanQuery.includes('threat') || cleanQuery.includes('severity');
    const isDecisionQuery = cleanQuery.includes('decision') || cleanQuery.includes('decide') || cleanQuery.includes('why') || cleanQuery.includes('rationale') || cleanQuery.includes('chose') || cleanQuery.includes('architecture');
    const isActionQuery = cleanQuery.includes('action') || cleanQuery.includes('task') || cleanQuery.includes('assign') || cleanQuery.includes('todo') || cleanQuery.includes('who');

    for (const meeting of meetings) {
      const meetingDateStr = meeting.startTime
        ? new Date(meeting.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : new Date(meeting.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      // Citations: Risks
      for (const r of meeting.risks) {
        const textToMatch = `${r.description} ${r.mitigation || ''} ${r.severity}`.toLowerCase();
        const matchesToken = isRiskQuery || queryTokens.some((tok) => textToMatch.includes(tok));
        if (matchesToken) {
          citations.push({
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            speakerName: r.sourceSegment?.speakerName || 'Risk Assessment',
            timestampStartMs: r.sourceSegment?.startTimeMs ? Number(r.sourceSegment.startTimeMs) : undefined,
            timestampFormatted: formatTime(r.sourceSegment?.startTimeMs),
            snippet: `[${r.severity}] ${r.description}${r.mitigation ? ` (Mitigation: ${r.mitigation})` : ''}`,
            type: 'RISK',
          });
          relevantMeetingsMap.set(meeting.id, {
            id: meeting.id,
            title: meeting.title,
            date: meetingDateStr,
            summary: meeting.summaries[0]?.executiveSummary,
          });
        }
      }

      // Citations: Decisions
      for (const d of meeting.decisions) {
        const textToMatch = `${d.decision} ${d.context || ''}`.toLowerCase();
        const matchesToken = isDecisionQuery || queryTokens.some((tok) => textToMatch.includes(tok));
        if (matchesToken) {
          citations.push({
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            speakerName: d.sourceSegment?.speakerName || 'Speaker',
            timestampStartMs: d.sourceSegment?.startTimeMs ? Number(d.sourceSegment.startTimeMs) : undefined,
            timestampFormatted: formatTime(d.sourceSegment?.startTimeMs),
            snippet: `${d.decision}${d.context ? ` — Context: ${d.context}` : ''}`,
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

      // Citations: Action Items
      for (const a of meeting.actionItems) {
        const textToMatch = `${a.description} ${a.assigneeName || ''} ${a.assignee?.name || ''}`.toLowerCase();
        const matchesToken = isActionQuery || queryTokens.some((tok) => textToMatch.includes(tok));
        if (matchesToken) {
          citations.push({
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            speakerName: a.sourceSegment?.speakerName || 'Speaker',
            timestampStartMs: a.sourceSegment?.startTimeMs ? Number(a.sourceSegment.startTimeMs) : undefined,
            timestampFormatted: formatTime(a.sourceSegment?.startTimeMs),
            snippet: `${a.description} (Assigned to: ${a.assignee?.name || a.assigneeName || 'Unassigned'})`,
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

      // Citations: Summaries
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
            snippet: s.executiveSummary.slice(0, 180) + '...',
            type: 'SUMMARY',
          });
        }
      }

      // Citations: Transcript Segments
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
            if (citations.length >= 10) break;
          }
        }
      }
    }

    // Attempt AI-service synthesis via HTTP
    const aiServiceUrls = [
      process.env.AI_SERVICE_URL || 'http://localhost:8001',
      'http://localhost:8000',
    ];

    for (const baseUrl of aiServiceUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const aiResponse = await fetch(`${baseUrl}/api/v1/intelligence/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            meetings_context: meetingContexts,
            conversation_history: [],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (aiResponse.ok) {
          const result = (await aiResponse.json()) as {
            answer: string;
            confidence: number;
            highlighted_meeting_ids?: string[];
          };

          if (result && result.answer && result.answer.trim().length > 0) {
            this.logger.log(`Successfully generated AI synthesis via ai-service at ${baseUrl}`);
            
            // Mark highlighted meetings
            if (result.highlighted_meeting_ids) {
              for (const hid of result.highlighted_meeting_ids) {
                const found = meetings.find((m) => m.id === hid);
                if (found && !relevantMeetingsMap.has(hid)) {
                  relevantMeetingsMap.set(hid, {
                    id: found.id,
                    title: found.title,
                    date: found.startTime ? new Date(found.startTime).toLocaleDateString('en-US') : undefined,
                    summary: found.summaries[0]?.executiveSummary,
                  });
                }
              }
            }

            return {
              answer: result.answer,
              citations: citations.slice(0, 10),
              relevantMeetings: Array.from(relevantMeetingsMap.values()).slice(0, 5),
            };
          }
        }
      } catch (err: any) {
        this.logger.debug(`AI-service synthesis at ${baseUrl} was unavailable or timed out: ${err.message}`);
      }
    }

    // High-grade analytical synthesizer fallback
    return this.synthesizeAnalyticalAnswer(query, meetings, citations, relevantMeetingsMap);
  }

  /**
   * Resilient local analytical engine producing comprehensive, multi-meeting markdown synthesis
   */
  private synthesizeAnalyticalAnswer(
    query: string,
    meetings: any[],
    citations: RAGCitation[],
    relevantMeetingsMap: Map<string, { id: string; title: string; date?: string; summary?: string }>,
  ): RAGAnswerResponse {
    const qLower = query.toLowerCase();
    const isRiskQuery = qLower.includes('risk') || qLower.includes('danger') || qLower.includes('blocker') || qLower.includes('threat') || qLower.includes('obstacle') || qLower.includes('severity');
    const isComparative = qLower.includes('only') || qLower.includes('other') || qLower.includes('all') || qLower.includes('across') || qLower.includes('compare') || qLower.includes('which');
    const isDecisionQuery = qLower.includes('decision') || qLower.includes('decide') || qLower.includes('why') || qLower.includes('rationale') || qLower.includes('chose') || qLower.includes('architecture');
    const isActionQuery = qLower.includes('action') || qLower.includes('task') || qLower.includes('assign') || qLower.includes('deadline') || qLower.includes('status');

    let answerText = '';

    // 1. Comprehensive Risk Audit Across All Meetings
    if (isRiskQuery) {
      const meetingsWithRisks = meetings.filter((m) => m.risks && m.risks.length > 0);
      const meetingsWithoutRisks = meetings.filter((m) => !m.risks || m.risks.length === 0);

      const lines: string[] = [];

      if (isComparative) {
        lines.push('### Direct Answer\n');
        if (meetingsWithRisks.length === 0) {
          lines.push('No active risks or technical blockers have been flagged across any recorded meetings in your workspace.');
        } else if (meetingsWithRisks.length === 1) {
          const m = meetingsWithRisks[0];
          lines.push(`**No, only "${m.title}" has recorded risks.** Across all **${meetings.length} meeting sessions** analyzed in your organization, no other meetings have registered risks or obstacles.`);
        } else {
          lines.push(`**Risks were identified across ${meetingsWithRisks.length} of ${meetings.length} meetings.** Risks are not isolated to a single meeting.`);
        }

        lines.push('\n### Detailed Risk Breakdown\n');
        for (const m of meetingsWithRisks) {
          relevantMeetingsMap.set(m.id, {
            id: m.id,
            title: m.title,
            date: m.startTime ? new Date(m.startTime).toLocaleDateString('en-US') : undefined,
            summary: m.summaries[0]?.executiveSummary,
          });
          const dateStr = m.startTime ? new Date(m.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recorded';
          lines.push(`#### In "${m.title}" (${dateStr}):`);
          for (const r of m.risks) {
            lines.push(`- **[${r.severity} Priority]** ${r.description}`);
            if (r.mitigation) {
              lines.push(`  *Mitigation Strategy:* ${r.mitigation}`);
            }
          }
          lines.push('');
        }

        if (meetingsWithoutRisks.length > 0) {
          const safeTitles = meetingsWithoutRisks.slice(0, 6).map((m) => `"${m.title}"`).join(', ');
          lines.push('### Meetings with No Identified Risks\n');
          lines.push(`The following ${meetingsWithoutRisks.length} meetings have **zero flagged risks or blockers**: ${safeTitles}.`);
        }
      } else {
        lines.push('### Identified Risks Across Workspace Meetings\n');
        if (meetingsWithRisks.length === 0) {
          lines.push('There are currently no recorded risks or blockers found in your meeting transcripts.');
        } else {
          for (const m of meetingsWithRisks) {
            relevantMeetingsMap.set(m.id, {
              id: m.id,
              title: m.title,
              date: m.startTime ? new Date(m.startTime).toLocaleDateString('en-US') : undefined,
              summary: m.summaries[0]?.executiveSummary,
            });
            lines.push(`**"${m.title}"**:`);
            for (const r of m.risks) {
              lines.push(`- **[${r.severity}]** ${r.description}${r.mitigation ? ` (*Mitigation:* ${r.mitigation})` : ''}`);
            }
            lines.push('');
          }
        }
      }

      answerText = lines.join('\n').trim();
    }
    // 2. Decision & Architecture Queries
    else if (isDecisionQuery) {
      const meetingsWithDecisions = meetings.filter((m) => m.decisions && m.decisions.length > 0);
      const lines = ['### Recorded Decisions & Architectural Context\n'];

      if (meetingsWithDecisions.length === 0) {
        lines.push('No formal architectural or technical decisions were recorded matching this query.');
      } else {
        for (const m of meetingsWithDecisions) {
          relevantMeetingsMap.set(m.id, {
            id: m.id,
            title: m.title,
            date: m.startTime ? new Date(m.startTime).toLocaleDateString('en-US') : undefined,
            summary: m.summaries[0]?.executiveSummary,
          });
          const dateStr = m.startTime ? new Date(m.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recorded';
          lines.push(`#### In "${m.title}" (${dateStr}):`);
          for (const d of m.decisions) {
            lines.push(`- **Decision:** ${d.decision}`);
            if (d.context) {
              lines.push(`  *Rationale & Context:* ${d.context}`);
            }
          }
          lines.push('');
        }
      }

      answerText = lines.join('\n').trim();
    }
    // 3. Action Items & Assignments
    else if (isActionQuery) {
      const meetingsWithActions = meetings.filter((m) => m.actionItems && m.actionItems.length > 0);
      const lines = ['### Action Items & Task Accountability\n'];

      if (meetingsWithActions.length === 0) {
        lines.push('No pending action items or tasks were extracted from your meeting transcripts.');
      } else {
        for (const m of meetingsWithActions) {
          relevantMeetingsMap.set(m.id, {
            id: m.id,
            title: m.title,
            date: m.startTime ? new Date(m.startTime).toLocaleDateString('en-US') : undefined,
            summary: m.summaries[0]?.executiveSummary,
          });
          lines.push(`#### In "${m.title}":`);
          for (const a of m.actionItems) {
            const assignee = a.assignee?.name || a.assigneeName || 'Unassigned';
            lines.push(`- **${a.description}** — Assigned to **${assignee}** \`[${a.status} | Priority: ${a.priority}]\``);
          }
          lines.push('');
        }
      }

      answerText = lines.join('\n').trim();
    }
    // 4. General / Recency Multi-Meeting Synthesis
    else {
      const latest = meetings[0];
      relevantMeetingsMap.set(latest.id, {
        id: latest.id,
        title: latest.title,
        date: latest.startTime ? new Date(latest.startTime).toLocaleDateString('en-US') : undefined,
        summary: latest.summaries[0]?.executiveSummary,
      });

      const lines = ['### Executive Overview\n'];
      if (latest.summaries.length > 0) {
        lines.push(`In **"${latest.title}"**:\n\n${latest.summaries[0].executiveSummary}\n`);
      }

      if (latest.topics && latest.topics.length > 0) {
        lines.push('### Key Discussion Topics:\n');
        for (const t of latest.topics.slice(0, 3)) {
          lines.push(`- **${t.title}**: ${t.summary}`);
        }
      }

      answerText = lines.join('\n').trim();
    }

    return {
      answer: answerText,
      citations: citations.slice(0, 10),
      relevantMeetings: Array.from(relevantMeetingsMap.values()).slice(0, 5),
    };
  }
}
