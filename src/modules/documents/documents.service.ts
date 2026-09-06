import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  TableLayoutType,
  AlignmentType,
  BorderStyle,
  ShadingType,
} from 'docx';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByMeetingId(meetingId: string) {
    return this.prisma.document.findMany({
      where: { meetingId },
    });
  }

  /**
   * Generates a genuine binary .docx document using Office Open XML
   */
  async generateDocxBuffer(meeting: any): Promise<Buffer> {
    const summary = meeting.summaries?.[0];
    const dateStr = meeting.startTime
      ? new Date(meeting.startTime).toLocaleDateString()
      : new Date(meeting.createdAt).toLocaleDateString();

    const sections: any[] = [];

    // Title & Metadata
    sections.push(
      new Paragraph({
        text: meeting.title || 'Meeting Summary',
        heading: HeadingLevel.TITLE,
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Date: ', bold: true }),
          new TextRun(dateStr),
          new TextRun({ text: '   |   Host: ', bold: true }),
          new TextRun(meeting.creator?.name || 'MeetingOS Host'),
          new TextRun({ text: '   |   Status: ', bold: true }),
          new TextRun(meeting.status || 'COMPLETED'),
        ],
        spacing: { after: 200 },
      }),
    );

    if (meeting.meetingUrl) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Meeting Link: ', bold: true }),
            new TextRun({ text: meeting.meetingUrl, color: '0284C7' }),
          ],
          spacing: { after: 240 },
        }),
      );
    }

    // 1. Executive Summary
    sections.push(
      new Paragraph({
        text: 'Executive Summary',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: summary?.executiveSummary || summary?.summary || 'No summary recorded yet.',
            italics: !summary,
          }),
        ],
        spacing: { after: 200 },
      }),
    );

    if (summary?.summary && summary?.executiveSummary) {
      sections.push(
        new Paragraph({
          text: 'Detailed Discussion Narrative',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 180, after: 100 },
        }),
        new Paragraph({
          children: [new TextRun(summary.summary.replace(/###\s*/g, ''))],
          spacing: { after: 200 },
        }),
      );
    }

    // 2. Discussion Topics
    if (meeting.topics && meeting.topics.length > 0) {
      sections.push(
        new Paragraph({
          text: 'Discussion Topics',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        }),
      );

      meeting.topics.forEach((t: any, idx: number) => {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${idx + 1}. ${t.title || t.topic || 'Topic'} `, bold: true }),
              new TextRun({
                text: t.importance ? `(Importance: ${t.importance}/5)` : '',
                italics: true,
                color: '64748B',
              }),
            ],
            spacing: { before: 80, after: 40 },
          }),
          new Paragraph({
            children: [new TextRun(t.summary || (Array.isArray(t.keyPoints) ? t.keyPoints.join('. ') : ''))],
            spacing: { after: 140 },
          }),
        );
      });
    }

    // 3. Key Decisions
    if (meeting.decisions && meeting.decisions.length > 0) {
      sections.push(
        new Paragraph({
          text: 'Key Decisions',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        }),
      );

      meeting.decisions.forEach((d: any, idx: number) => {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({ text: `• ${d.decision} `, bold: true }),
              new TextRun({
                text: d.confidence ? `[Confidence: ${Math.round(d.confidence * 100)}%]` : '',
                color: '16A34A',
                bold: true,
              }),
            ],
            spacing: { before: 60, after: 40 },
          }),
        );
        if (d.context) {
          sections.push(
            new Paragraph({
              children: [
                new TextRun({ text: '   Context: ', italics: true }),
                new TextRun({ text: d.context, color: '475569' }),
              ],
              spacing: { after: 100 },
            }),
          );
        }
      });
    }

    // 4. Action Items Table
    if (meeting.actionItems && meeting.actionItems.length > 0) {
      sections.push(
        new Paragraph({
          text: 'Action Items',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        }),
      );

      const tableRows = [
        new TableRow({
          tableHeader: true,
          children: [
            new TableCell({
              width: { size: 4212, type: WidthType.DXA },
              shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
              margins: { top: 120, bottom: 120, left: 140, right: 140 },
              children: [new Paragraph({ children: [new TextRun({ text: 'Task Description', bold: true, color: '0F172A' })] })],
            }),
            new TableCell({
              width: { size: 1872, type: WidthType.DXA },
              shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
              margins: { top: 120, bottom: 120, left: 140, right: 140 },
              children: [new Paragraph({ children: [new TextRun({ text: 'Assignee', bold: true, color: '0F172A' })] })],
            }),
            new TableCell({
              width: { size: 1404, type: WidthType.DXA },
              shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
              margins: { top: 120, bottom: 120, left: 140, right: 140 },
              children: [new Paragraph({ children: [new TextRun({ text: 'Priority', bold: true, color: '0F172A' })] })],
            }),
            new TableCell({
              width: { size: 1872, type: WidthType.DXA },
              shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
              margins: { top: 120, bottom: 120, left: 140, right: 140 },
              children: [new Paragraph({ children: [new TextRun({ text: 'Deadline', bold: true, color: '0F172A' })] })],
            }),
          ],
        }),
      ];

      meeting.actionItems.forEach((a: any) => {
        const deadline = a.deadline ? new Date(a.deadline).toLocaleDateString() : '-';
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({
                width: { size: 4212, type: WidthType.DXA },
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
                children: [new Paragraph(a.description || a.task || '')],
              }),
              new TableCell({
                width: { size: 1872, type: WidthType.DXA },
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
                children: [new Paragraph(a.assigneeName || a.assignee?.name || 'Unassigned')],
              }),
              new TableCell({
                width: { size: 1404, type: WidthType.DXA },
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
                children: [new Paragraph(a.priority || 'MEDIUM')],
              }),
              new TableCell({
                width: { size: 1872, type: WidthType.DXA },
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
                children: [new Paragraph(deadline)],
              }),
            ],
          }),
        );
      });

      sections.push(
        new Table({
          layout: TableLayoutType.FIXED,
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [4212, 1872, 1404, 1872],
          alignment: AlignmentType.CENTER,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
            insideVertical: { style: BorderStyle.NONE },
          },
          rows: tableRows,
        }),
        new Paragraph({ text: '', spacing: { after: 200 } }),
      );
    }

    // 5. Risks & Blockers
    if (meeting.risks && meeting.risks.length > 0) {
      sections.push(
        new Paragraph({
          text: 'Risks & Blockers',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        }),
      );

      meeting.risks.forEach((r: any) => {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({ text: `[RISK] ${r.description || r.risk} `, bold: true, color: 'DC2626' }),
              new TextRun({ text: `[${r.severity} Severity]`, color: 'DC2626', bold: true }),
            ],
            spacing: { before: 60, after: 40 },
          }),
        );
        if (r.mitigation) {
          sections.push(
            new Paragraph({
              children: [
                new TextRun({ text: '   Mitigation: ', bold: true }),
                new TextRun(r.mitigation),
              ],
              spacing: { after: 100 },
            }),
          );
        }
      });
    }

    // 6. Open Questions
    if (meeting.openQuestions && meeting.openQuestions.length > 0) {
      sections.push(
        new Paragraph({
          text: 'Open Questions',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        }),
      );

      meeting.openQuestions.forEach((q: any, idx: number) => {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({ text: `[Q${idx + 1}] ${q.question}`, bold: true }),
              new TextRun({
                text: q.assignedTo ? ` (Assigned: ${q.assignedTo})` : '',
                italics: true,
                color: '64748B',
              }),
            ],
            spacing: { before: 60, after: 80 },
          }),
        );
      });
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: sections,
        },
      ],
    });

    return await Packer.toBuffer(doc);
  }

  /**
   * Generates a native binary vector PDF document using pdfkit
   */
  async generatePdfBuffer(meeting: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 45,
          info: {
            Title: `${meeting.title || 'Meeting Summary'}`,
            Author: 'MeetingOS Intelligence Engine',
          },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk: any) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err: any) => reject(err));

        const summary = meeting.summaries?.[0];
        const dateStr = meeting.startTime
          ? new Date(meeting.startTime).toLocaleDateString()
          : new Date(meeting.createdAt).toLocaleDateString();

        // Header Title
        doc.fillColor('#0F172A').fontSize(20).font('Helvetica-Bold').text(meeting.title || 'Meeting Summary');
        doc.moveDown(0.3);

        // Metadata Subheader
        doc
          .fillColor('#64748B')
          .fontSize(9)
          .font('Helvetica')
          .text(
            `Date: ${dateStr}   |   Host: ${meeting.creator?.name || 'MeetingOS Host'}   |   Status: ${meeting.status}${
              meeting.meetingUrl ? `   |   Link: ${meeting.meetingUrl}` : ''
            }`,
          );
        doc.moveDown(0.8);

        // Horizontal Line Separator
        doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(45, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.8);

        // Section: Executive Summary
        doc.fillColor('#0284C7').fontSize(13).font('Helvetica-Bold').text('Executive Summary');
        doc.moveDown(0.3);

        const summaryText = summary?.executiveSummary || summary?.summary || 'No summary recorded yet.';
        doc.fillColor('#1E293B').fontSize(10).font('Helvetica').text(summaryText, {
          lineGap: 3,
          align: 'justify',
        });
        doc.moveDown(0.8);

        // Detailed Narrative
        if (summary?.summary && summary?.executiveSummary) {
          doc.fillColor('#334155').fontSize(11).font('Helvetica-Bold').text('Detailed Discussion Narrative');
          doc.moveDown(0.3);
          const cleanNarrative = summary.summary.replace(/###\s*/g, '');
          doc.fillColor('#334155').fontSize(9.5).font('Helvetica').text(cleanNarrative, {
            lineGap: 2.5,
            align: 'justify',
          });
          doc.moveDown(0.8);
        }

        // Section: Discussion Topics
        if (meeting.topics && meeting.topics.length > 0) {
          doc.fillColor('#0284C7').fontSize(13).font('Helvetica-Bold').text('Discussion Topics');
          doc.moveDown(0.4);

          meeting.topics.forEach((t: any, i: number) => {
            doc
              .fillColor('#0F172A')
              .fontSize(10)
              .font('Helvetica-Bold')
              .text(`${i + 1}. ${t.title}`, { continued: true })
              .fillColor('#64748B')
              .font('Helvetica')
              .text(t.importance ? `  (Importance: ${t.importance}/5)` : '');
            doc.moveDown(0.1);
            doc.fillColor('#475569').fontSize(9).font('Helvetica').text(t.summary, { lineGap: 2 });
            doc.moveDown(0.4);
          });
          doc.moveDown(0.4);
        }

        // Section: Key Decisions
        if (meeting.decisions && meeting.decisions.length > 0) {
          doc.fillColor('#0284C7').fontSize(13).font('Helvetica-Bold').text('Key Decisions');
          doc.moveDown(0.4);

          meeting.decisions.forEach((d: any, i: number) => {
            doc
              .fillColor('#0F172A')
              .fontSize(10)
              .font('Helvetica-Bold')
              .text(`• ${d.decision}`, { continued: true })
              .fillColor('#16A34A')
              .fontSize(9)
              .text(d.confidence ? `  [Confidence: ${Math.round(d.confidence * 100)}%]` : '');
            if (d.context) {
              doc.fillColor('#64748B').fontSize(9).font('Helvetica-Oblique').text(`   Context: ${d.context}`);
            }
            doc.moveDown(0.3);
          });
          doc.moveDown(0.5);
        }

        // Section: Action Items
        if (meeting.actionItems && meeting.actionItems.length > 0) {
          doc.fillColor('#0284C7').fontSize(13).font('Helvetica-Bold').text('Action Items');
          doc.moveDown(0.4);

          meeting.actionItems.forEach((a: any) => {
            const deadline = a.deadline ? new Date(a.deadline).toLocaleDateString() : 'No deadline';
            const assignee = a.assigneeName || a.assignee?.name || 'Unassigned';

            doc
              .fillColor('#0F172A')
              .fontSize(9.5)
              .font('Helvetica-Bold')
              .text(`[${a.priority || 'MEDIUM'}] `, { continued: true })
              .fillColor('#1E293B')
              .text(a.description || a.task || '', { continued: true })
              .fillColor('#0284C7')
              .text(` — Assigned to ${assignee}`)
              .fillColor('#64748B')
              .fontSize(8.5)
              .font('Helvetica')
              .text(`   Status: ${a.status}   |   Due: ${deadline}`);
            doc.moveDown(0.3);
          });
          doc.moveDown(0.5);
        }

        // Section: Risks & Blockers
        if (meeting.risks && meeting.risks.length > 0) {
          doc.fillColor('#DC2626').fontSize(13).font('Helvetica-Bold').text('Risks & Blockers');
          doc.moveDown(0.4);

          meeting.risks.forEach((r: any) => {
            doc
              .fillColor('#991B1B')
              .fontSize(9.5)
              .font('Helvetica-Bold')
              .text(`[RISK] ${r.description || r.risk} `, { continued: true })
              .fillColor('#DC2626')
              .fontSize(8.5)
              .text(`[${r.severity} Severity]`);
            if (r.mitigation) {
              doc
                .fillColor('#4B5563')
                .fontSize(8.5)
                .font('Helvetica')
                .text(`   Mitigation: ${r.mitigation}`);
            }
            doc.moveDown(0.3);
          });
          doc.moveDown(0.5);
        }

        // Section: Open Questions
        if (meeting.openQuestions && meeting.openQuestions.length > 0) {
          doc.fillColor('#0284C7').fontSize(13).font('Helvetica-Bold').text('Open Questions');
          doc.moveDown(0.4);

          meeting.openQuestions.forEach((q: any, i: number) => {
            doc
              .fillColor('#0F172A')
              .fontSize(9.5)
              .font('Helvetica-Bold')
              .text(`Q${i + 1}: ${q.question}`, { continued: true })
              .fillColor('#64748B')
              .fontSize(8.5)
              .font('Helvetica')
              .text(q.assignedTo ? `  (Assigned: ${q.assignedTo})` : '');
            doc.moveDown(0.3);
          });
          doc.moveDown(0.5);
        }

        // Footer
        doc
          .fillColor('#94A3B8')
          .fontSize(8)
          .font('Helvetica')
          .text(
            `Generated by MeetingOS Intelligence Engine on ${new Date().toLocaleString()}   |   Confidential & Proprietary`,
            45,
            780,
            { align: 'center', width: 505 },
          );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Main export handler supporting native .docx, native .pdf, and markdown
   */
  async exportMeetingReport(meetingId: string, format = 'docx') {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        creator: { select: { name: true, email: true } },
        participants: true,
        summaries: { orderBy: { createdAt: 'desc' }, take: 1 },
        topics: { orderBy: { importance: 'desc' } },
        decisions: { orderBy: { createdAt: 'asc' } },
        actionItems: { orderBy: { createdAt: 'asc' } },
        risks: { orderBy: { createdAt: 'asc' } },
        openQuestions: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting with ID ${meetingId} not found`);
    }

    const safeTitle = (meeting.title || 'Meeting_Summary').replace(/[^a-zA-Z0-9_-]/g, '_');
    const normalizedFormat = format.toLowerCase();

    // 1. Binary Microsoft Word (.docx)
    if (normalizedFormat === 'docx' || normalizedFormat === 'doc') {
      const docxBuffer = await this.generateDocxBuffer(meeting);
      return {
        content: docxBuffer,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: `${safeTitle}_Summary.docx`,
      };
    }

    // 2. Binary PDF (.pdf)
    if (normalizedFormat === 'pdf') {
      const pdfBuffer = await this.generatePdfBuffer(meeting);
      return {
        content: pdfBuffer,
        mimeType: 'application/pdf',
        filename: `${safeTitle}_Summary.pdf`,
      };
    }

    // 3. Markdown format
    const dateStr = meeting.startTime
      ? new Date(meeting.startTime).toLocaleDateString()
      : new Date(meeting.createdAt).toLocaleDateString();
    const summary = meeting.summaries?.[0];

    let md = `# ${meeting.title}\n\n`;
    md += `**Date:** ${dateStr}  \n`;
    md += `**Host:** ${meeting.creator?.name || 'MeetingOS Host'}  \n`;
    md += `**Status:** ${meeting.status}  \n`;
    if (meeting.meetingUrl) {
      md += `**Meeting URL:** ${meeting.meetingUrl}  \n`;
    }
    md += `\n---\n\n`;

    md += `## Executive Summary\n\n`;
    md += `${summary?.executiveSummary || summary?.summary || 'No summary recorded yet.'}\n\n`;

    if (summary?.summary && summary?.executiveSummary) {
      md += `### Detailed Discussion Narrative\n\n${summary.summary}\n\n`;
    }

    if (meeting.topics.length > 0) {
      md += `## Discussion Topics\n\n`;
      meeting.topics.forEach((t: any, i: number) => {
        md += `### ${i + 1}. ${t.title} (Importance: ${t.importance}/5)\n${t.summary}\n\n`;
      });
    }

    if (meeting.decisions.length > 0) {
      md += `## Key Decisions\n\n`;
      meeting.decisions.forEach((d: any, i: number) => {
        md += `${i + 1}. **${d.decision}**\n`;
        if (d.context) md += `   - *Context:* ${d.context}\n`;
        if (d.confidence) md += `   - *Confidence:* ${Math.round(d.confidence * 100)}%\n`;
      });
      md += `\n`;
    }

    if (meeting.actionItems.length > 0) {
      md += `## Action Items\n\n`;
      md += `| Task | Assignee | Priority | Status | Deadline |\n`;
      md += `|---|---|---|---|---|\n`;
      meeting.actionItems.forEach((a: any) => {
        const deadline = a.deadline ? new Date(a.deadline).toLocaleDateString() : '-';
        md += `| ${a.description || a.task} | ${a.assigneeName || 'Unassigned'} | ${a.priority} | ${a.status} | ${deadline} |\n`;
      });
      md += `\n`;
    }

    if (meeting.risks.length > 0) {
      md += `## Risks & Blockers\n\n`;
      meeting.risks.forEach((r: any, i: number) => {
        md += `${i + 1}. **${r.description || r.risk}** [${r.severity} Severity]\n`;
        if (r.mitigation) md += `   - *Mitigation:* ${r.mitigation}\n`;
      });
      md += `\n`;
    }

    if (meeting.openQuestions.length > 0) {
      md += `## Open Questions\n\n`;
      meeting.openQuestions.forEach((q: any, i: number) => {
        md += `${i + 1}. **${q.question}**\n`;
        if (q.assignedTo) md += `   - *Assigned To:* ${q.assignedTo}\n`;
      });
      md += `\n`;
    }

    return {
      content: Buffer.from(md, 'utf-8'),
      mimeType: 'text/markdown',
      filename: `${safeTitle}_Summary.md`,
    };
  }
}
