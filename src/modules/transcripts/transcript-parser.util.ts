export interface ParsedSegment {
  sequence: number;
  speakerName?: string;
  speakerId?: string;
  text: string;
  startTimeMs?: bigint;
  endTimeMs?: bigint;
}

export interface ParsedTranscriptResult {
  source: string;
  language: string;
  segments: ParsedSegment[];
  rawText: string;
}

export class TranscriptParserUtil {
  /**
   * Main entrypoint to parse various transcript formats
   */
  static parse(
    rawContent: string,
    mimeType?: string,
    filename?: string,
  ): ParsedTranscriptResult {
    const trimmed = rawContent.trim();
    const ext = filename?.split('.').pop()?.toLowerCase() || '';

    // 1. Check if JSON
    if (
      ext === 'json' ||
      mimeType?.includes('json') ||
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return this.parseJson(trimmed);
      } catch {
        // Fall back to text parsing if JSON parse fails
      }
    }

    // 2. Check if WebVTT
    if (
      ext === 'vtt' ||
      mimeType?.includes('vtt') ||
      trimmed.startsWith('WEBVTT')
    ) {
      return this.parseWebVTT(trimmed);
    }

    // 3. Check if SRT
    if (ext === 'srt' || /^\d+\r?\n\d{2}:\d{2}:\d{2}/.test(trimmed)) {
      return this.parseSRT(trimmed);
    }

    // 4. Check for timestamped speaker text [HH:MM:SS] Speaker: text
    if (/\[\d{2}:\d{2}(?::\d{2})?\]/.test(trimmed)) {
      return this.parseTimestampedText(trimmed);
    }

    // 5. Fallback plain text
    return this.parsePlainText(trimmed);
  }

  /**
   * Parses structured JSON transcript
   */
  private static parseJson(jsonStr: string): ParsedTranscriptResult {
    const data = JSON.parse(jsonStr);
    const segments: ParsedSegment[] = [];
    let rawText = '';

    const rawSegments = Array.isArray(data)
      ? data
      : data.segments || data.transcript || data.items || [];

    if (Array.isArray(rawSegments) && rawSegments.length > 0) {
      rawSegments.forEach((seg: any, idx: number) => {
        const text = seg.text || seg.content || seg.transcript || '';
        if (!text) return;

        const speakerName =
          seg.speakerName || seg.speaker || seg.speaker_name || seg.author;
        const startTimeMs =
          seg.startTimeMs !== undefined
            ? BigInt(Math.round(Number(seg.startTimeMs)))
            : seg.start !== undefined
              ? BigInt(Math.round(Number(seg.start) * 1000))
              : undefined;
        const endTimeMs =
          seg.endTimeMs !== undefined
            ? BigInt(Math.round(Number(seg.endTimeMs)))
            : seg.end !== undefined
              ? BigInt(Math.round(Number(seg.end) * 1000))
              : undefined;

        segments.push({
          sequence: idx + 1,
          speakerName: speakerName ? String(speakerName) : undefined,
          text: text.trim(),
          startTimeMs,
          endTimeMs,
        });

        rawText += (speakerName ? `${speakerName}: ` : '') + text.trim() + '\n';
      });
    } else if (typeof data === 'object' && data.text) {
      return this.parsePlainText(data.text);
    }

    return {
      source: 'JSON',
      language: data.language || 'en',
      segments:
        segments.length > 0
          ? segments
          : this.parsePlainText(jsonStr).segments,
      rawText: rawText || jsonStr,
    };
  }

  /**
   * Parses WebVTT transcripts
   */
  private static parseWebVTT(vttStr: string): ParsedTranscriptResult {
    const lines = vttStr.split(/\r?\n/);
    const segments: ParsedSegment[] = [];
    let rawText = '';
    let sequence = 1;

    let currentStartMs: bigint | undefined;
    let currentEndMs: bigint | undefined;
    let currentSpeaker: string | undefined;
    let currentText = '';

    const timeRegex =
      /(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE')) {
        continue;
      }

      const match = line.match(timeRegex);
      if (match) {
        // If we have previous segment, push it
        if (currentText) {
          segments.push({
            sequence: sequence++,
            speakerName: currentSpeaker,
            text: currentText.trim(),
            startTimeMs: currentStartMs,
            endTimeMs: currentEndMs,
          });
          rawText +=
            (currentSpeaker ? `${currentSpeaker}: ` : '') +
            currentText.trim() +
            '\n';
          currentText = '';
          currentSpeaker = undefined;
        }

        currentStartMs = this.timeToMs(match[1], match[2], match[3], match[4]);
        currentEndMs = this.timeToMs(match[5], match[6], match[7], match[8]);
        continue;
      }

      // Check for speaker tags like <v Speaker Name>
      const speakerMatch = line.match(/<v\s+([^>]+)>(.*)/);
      if (speakerMatch) {
        currentSpeaker = speakerMatch[1].trim();
        const textContent = speakerMatch[2].replace(/<\/v>/g, '').trim();
        currentText += (currentText ? ' ' : '') + textContent;
      } else {
        currentText += (currentText ? ' ' : '') + line;
      }
    }

    if (currentText) {
      segments.push({
        sequence: sequence++,
        speakerName: currentSpeaker,
        text: currentText.trim(),
        startTimeMs: currentStartMs,
        endTimeMs: currentEndMs,
      });
      rawText +=
        (currentSpeaker ? `${currentSpeaker}: ` : '') +
        currentText.trim() +
        '\n';
    }

    return {
      source: 'WEBVTT',
      language: 'en',
      segments,
      rawText,
    };
  }

  /**
   * Parses SubRip (.srt) transcripts
   */
  private static parseSRT(srtStr: string): ParsedTranscriptResult {
    const blocks = srtStr.trim().split(/\r?\n\r?\n/);
    const segments: ParsedSegment[] = [];
    let rawText = '';
    let sequence = 1;

    for (const block of blocks) {
      const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) continue;

      let timeLineIdx = 1;
      if (lines[0].includes('-->')) {
        timeLineIdx = 0;
      }

      const timeLine = lines[timeLineIdx];
      const match = timeLine.match(
        /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/,
      );

      const startMs = match
        ? this.timeToMs(match[1], match[2], match[3], match[4])
        : undefined;
      const endMs = match
        ? this.timeToMs(match[5], match[6], match[7], match[8])
        : undefined;

      const textLines = lines.slice(timeLineIdx + 1).join(' ');
      // Speaker extraction: "Speaker: Text"
      let speakerName: string | undefined;
      let textContent = textLines;

      const speakerMatch = textLines.match(/^([^:]+):\s*(.*)/);
      if (speakerMatch) {
        speakerName = speakerMatch[1].trim();
        textContent = speakerMatch[2].trim();
      }

      segments.push({
        sequence: sequence++,
        speakerName,
        text: textContent,
        startTimeMs: startMs,
        endTimeMs: endMs,
      });

      rawText += (speakerName ? `${speakerName}: ` : '') + textContent + '\n';
    }

    return {
      source: 'SRT',
      language: 'en',
      segments,
      rawText,
    };
  }

  /**
   * Parses timestamped speaker text format:
   * [00:01:23] Speaker Name (Role): Text...
   */
  private static parseTimestampedText(textStr: string): ParsedTranscriptResult {
    const lines = textStr.split(/\r?\n/);
    const segments: ParsedSegment[] = [];
    let sequence = 1;
    let rawText = '';

    const timestampRegex =
      /\[(?:(\d{2}):)?(\d{2}):(\d{2})\]\s*(?:([^:\n]+?):\s*)?(.*)/;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(timestampRegex);
      if (match) {
        const hours = match[1] || '00';
        const mins = match[2];
        const secs = match[3];
        const startMs = this.timeToMs(hours, mins, secs, '000');
        const speakerName = match[4]?.trim();
        const content = match[5]?.trim();

        segments.push({
          sequence: sequence++,
          speakerName: speakerName || undefined,
          text: content || trimmed,
          startTimeMs: startMs,
        });

        rawText += trimmed + '\n';
      } else {
        // Append to last segment or new segment
        if (segments.length > 0) {
          segments[segments.length - 1].text += ' ' + trimmed;
        } else {
          segments.push({
            sequence: sequence++,
            text: trimmed,
          });
        }
        rawText += trimmed + '\n';
      }
    }

    return {
      source: 'TXT',
      language: 'en',
      segments,
      rawText,
    };
  }

  /**
   * Fallback plain text chunker
   */
  private static parsePlainText(textStr: string): ParsedTranscriptResult {
    const paragraphs = textStr
      .split(/\r?\n\r?\n|\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const segments: ParsedSegment[] = [];
    let sequence = 1;

    for (const p of paragraphs) {
      let speakerName: string | undefined;
      let text = p;

      const colonMatch = p.match(/^([A-Z][a-zA-Z\s]{1,30}):\s*(.*)/);
      if (colonMatch) {
        speakerName = colonMatch[1].trim();
        text = colonMatch[2].trim();
      }

      segments.push({
        sequence: sequence++,
        speakerName,
        text,
      });
    }

    return {
      source: 'PLAIN_TEXT',
      language: 'en',
      segments,
      rawText: textStr,
    };
  }

  private static timeToMs(
    hours: string | undefined,
    mins: string,
    secs: string,
    millis: string,
  ): bigint {
    const h = hours ? parseInt(hours, 10) : 0;
    const m = parseInt(mins, 10);
    const s = parseInt(secs, 10);
    const ms = parseInt(millis || '0', 10);
    const totalMs = (h * 3600 + m * 60 + s) * 1000 + ms;
    return BigInt(totalMs);
  }
}
