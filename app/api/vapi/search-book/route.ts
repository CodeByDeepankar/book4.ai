import { searchBookSegments } from '@/lib/actions/book.actions';
import { saveConversationMemorySummary } from '@/lib/conversation-memory';
import { summarizeConversationForMemory } from '@/lib/vapi-call-summary';
import { NextResponse } from 'next/server';

const NO_INFO_RESULT = 'no information found about this topic.';
const SEARCH_TOOL_LIMIT = 3;

interface ToolCall {
  id: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface SearchToolParams {
  bookId?: string;
  query?: string;
  q?: string;
  topic?: string;
  search?: string;
  searchQuery?: string;
  book_id?: string;
}

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const pickFirstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

const getNestedValue = (source: unknown, path: string[]): unknown => {
  let current: unknown = source;

  for (const key of path) {
    const currentObject = asObject(current);
    if (!currentObject) return undefined;
    current = currentObject[key];
  }

  return current;
};

const extractEventPayload = (body: Record<string, unknown>): Record<string, unknown> => {
  return asObject(body.message) ?? body;
};

const isEndOfCallReport = (payload: Record<string, unknown>): boolean => {
  const messageType = pickFirstString(payload.type);
  return messageType === 'end-of-call-report' || messageType === 'call:ended' || messageType === 'call-ended';
};

const parseEventDate = (value: string): Date | undefined => {
  if (!value) return undefined;

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return undefined;

  return parsedDate;
};

const mergeVariableValues = (payload: Record<string, unknown>): Record<string, unknown> => {
  const merged: Record<string, unknown> = {};

  const candidates: unknown[] = [
    getNestedValue(payload, ['variableValues']),
    getNestedValue(payload, ['assistantOverrides', 'variableValues']),
    getNestedValue(payload, ['call', 'assistantOverrides', 'variableValues']),
    getNestedValue(payload, ['artifact', 'variableValues']),
    getNestedValue(payload, ['call', 'artifact', 'variableValues']),
  ];

  candidates.forEach((candidate) => {
    const candidateObject = asObject(candidate);
    if (!candidateObject) return;

    Object.entries(candidateObject).forEach(([key, value]) => {
      if (merged[key] === undefined) {
        merged[key] = value;
      }
    });
  });

  return merged;
};

const extractBookIdFromPayload = (payload: Record<string, unknown>): string => {
  const variableValues = mergeVariableValues(payload);

  return pickFirstString(
    variableValues.bookId,
    variableValues.book_id,
    getNestedValue(payload, ['call', 'metadata', 'bookId']),
    getNestedValue(payload, ['metadata', 'bookId']),
  );
};

const extractUserIdentifierFromPayload = (payload: Record<string, unknown>): string => {
  const variableValues = mergeVariableValues(payload);

  return pickFirstString(
    variableValues.userIdentifier,
    variableValues.user_identifier,
    variableValues.userId,
    variableValues.user_id,
    variableValues.phoneNumber,
    variableValues.phone_number,
    variableValues.phone,
    getNestedValue(payload, ['customer', 'number']),
    getNestedValue(payload, ['call', 'customer', 'number']),
    getNestedValue(payload, ['phoneNumber', 'number']),
    getNestedValue(payload, ['call', 'phoneNumber', 'number']),
    getNestedValue(payload, ['customer', 'externalId']),
    getNestedValue(payload, ['call', 'customer', 'externalId']),
    getNestedValue(payload, ['customer', 'id']),
    getNestedValue(payload, ['call', 'customer', 'id']),
  );
};

const extractCallIdFromPayload = (payload: Record<string, unknown>): string => {
  return pickFirstString(
    getNestedValue(payload, ['call', 'id']),
    payload.id,
  );
};

const extractConversationTranscript = (payload: Record<string, unknown>): string => {
  const directTranscript = pickFirstString(
    getNestedValue(payload, ['artifact', 'transcript']),
    getNestedValue(payload, ['call', 'artifact', 'transcript']),
  );

  if (directTranscript) {
    return directTranscript;
  }

  const transcriptMessages = [
    getNestedValue(payload, ['artifact', 'messages']),
    getNestedValue(payload, ['call', 'artifact', 'messages']),
    getNestedValue(payload, ['messages']),
  ];

  for (const transcriptMessageSource of transcriptMessages) {
    if (!Array.isArray(transcriptMessageSource)) continue;

    const lines = transcriptMessageSource
      .map((entry) => {
        const messageObject = asObject(entry);
        if (!messageObject) return '';

        const role = pickFirstString(messageObject.role) || 'speaker';
        const content = pickFirstString(messageObject.message, messageObject.content, messageObject.result);

        if (!content) return '';
        return `${role}: ${content}`;
      })
      .filter((line) => !!line);

    if (lines.length > 0) {
      return lines.join('\n');
    }
  }

  return '';
};

const normalizeToolName = (name: string): string => name.replace(/[\s_-]+/g, '').toLowerCase();

const isSearchBookTool = (toolName: string): boolean => {
  return normalizeToolName(toolName) === 'searchbook';
};

const parseToolArguments = (rawArguments: string | undefined): SearchToolParams => {
  if (!rawArguments) return {};

  try {
    const parsed = JSON.parse(rawArguments) as SearchToolParams;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const pickBookId = (params: SearchToolParams): string => {
  const rawBookId = params.bookId ?? params.book_id;
  return typeof rawBookId === 'string' ? rawBookId.trim() : '';
};

const pickQuery = (params: SearchToolParams): string => {
  const rawQuery = params.query ?? params.q ?? params.topic ?? params.search ?? params.searchQuery;
  return typeof rawQuery === 'string' ? rawQuery.trim() : '';
};

const formatSegmentResult = (segment: Record<string, unknown>): string => {
  const content = typeof segment.content === 'string' ? segment.content.trim() : '';
  if (!content) return '';

  const segmentIndex = segment.segmentIndex;
  if (typeof segmentIndex === 'number') {
    return `Segment ${segmentIndex}: ${content}`;
  }

  return content;
};

const parseToolCallsFromPayload = (payload: Record<string, unknown>): ToolCall[] => {
  const directList = payload.toolCallList;
  if (Array.isArray(directList)) {
    return directList as ToolCall[];
  }

  const withToolCallList = payload.toolWithToolCallList;
  if (Array.isArray(withToolCallList)) {
    return withToolCallList
      .map((item) => (item && typeof item === 'object' ? (item as { toolCall?: ToolCall }).toolCall : undefined))
      .filter((toolCall): toolCall is ToolCall => !!toolCall);
  }

  return [];
};

const extractToolCalls = (payload: Record<string, unknown>): ToolCall[] => {
  const fromPayload = parseToolCallsFromPayload(payload);
  if (fromPayload.length > 0) return fromPayload;

  const nestedMessage = asObject(payload.message);
  if (!nestedMessage) return [];

  return parseToolCallsFromPayload(nestedMessage);
};

const handleEndOfCallReport = async (payload: Record<string, unknown>) => {
  const userIdentifier = extractUserIdentifierFromPayload(payload);
  const bookId = extractBookIdFromPayload(payload);

  if (!userIdentifier || !bookId) {
    console.warn('Skipping memory save for end-of-call-report due to missing identifiers.', {
      hasUserIdentifier: !!userIdentifier,
      hasBookId: !!bookId,
    });

    return NextResponse.json({ success: true, skipped: true, reason: 'missing identifiers' });
  }

  const transcript = extractConversationTranscript(payload);
  const analysisSummary = pickFirstString(
    getNestedValue(payload, ['analysis', 'summary']),
    getNestedValue(payload, ['call', 'analysis', 'summary']),
  );

  const summary = await summarizeConversationForMemory({
    transcript,
    analysisSummary,
  });

  if (!summary) {
    return NextResponse.json({ success: true, skipped: true, reason: 'empty summary' });
  }

  const callId = extractCallIdFromPayload(payload);
  const endedAt = parseEventDate(
    pickFirstString(
      getNestedValue(payload, ['endedAt']),
      getNestedValue(payload, ['call', 'endedAt']),
    ),
  );

  const saveResult = await saveConversationMemorySummary({
    userIdentifier,
    bookId,
    callId,
    summary,
    createdAt: endedAt,
  });

  if (!saveResult.success) {
    console.error('Failed to save conversation memory summary:', saveResult.error);
    return NextResponse.json({ error: 'Failed to save conversation memory summary.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, memoryId: saveResult.id });
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const payload = extractEventPayload(body);

    if (isEndOfCallReport(payload)) {
      return handleEndOfCallReport(payload);
    }

    const toolCalls = extractToolCalls(payload);

    if (toolCalls.length === 0) {
      return NextResponse.json({ received: true });
    }

    const results = await Promise.all(
      toolCalls
        .filter((toolCall) => {
          const toolName = toolCall.function?.name;
          return typeof toolName === 'string' && isSearchBookTool(toolName);
        })
        .map(async (toolCall) => {
          const toolName = toolCall.function?.name ?? 'search book';
          const args = parseToolArguments(toolCall.function?.arguments);
          const bookId = pickBookId(args);
          const query = pickQuery(args);

          if (!bookId || !query) {
            return {
              name: toolName,
              toolCallId: toolCall.id,
              result: NO_INFO_RESULT,
            };
          }

          const searchResult = await searchBookSegments(bookId, query, SEARCH_TOOL_LIMIT);

          if (!searchResult.success || !Array.isArray(searchResult.data) || searchResult.data.length === 0) {
            return {
              name: toolName,
              toolCallId: toolCall.id,
              result: NO_INFO_RESULT,
            };
          }

          const combined = searchResult.data
            .map((segment) => formatSegmentResult(segment as Record<string, unknown>))
            .filter((segmentText) => !!segmentText)
            .join('\n\n');

          return {
            name: toolName,
            toolCallId: toolCall.id,
            result: combined || NO_INFO_RESULT,
          };
        }),
    );

    return NextResponse.json({ results, received: true });
  } catch (error) {
    console.error('Vapi search-book route error:', error);

    return NextResponse.json(
      {
        error: 'Failed to process search-book tool call.',
      },
      { status: 500 },
    );
  }
}
