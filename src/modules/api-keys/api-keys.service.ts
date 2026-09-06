import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listApiKeys(organizationId: string, userId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return keys;
  }

  async createApiKey(organizationId: string, userId: string, dto: CreateApiKeyDto) {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('API key name is required');
    }

    // 1. Generate high-entropy 256-bit cryptographic token
    const randomBytes = crypto.randomBytes(24).toString('hex');
    const secretKey = `mos_live_${randomBytes}`;
    
    // 2. Hash using SHA-256 for secure verification
    const keyHash = crypto.createHash('sha256').update(secretKey).digest('hex');
    
    // 3. Create masked prefix
    const last4 = secretKey.slice(-4);
    const keyPrefix = `mos_live_••••••${last4}`;

    // 4. Calculate optional expiration date
    let expiresAt: Date | null = null;
    if (dto.expiresInDays && dto.expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(dto.expiresInDays));
    }

    const defaultScopes = ['meetings:read', 'meetings:write', 'rag:query'];
    const scopes = Array.isArray(dto.scopes) && dto.scopes.length > 0 ? dto.scopes : defaultScopes;

    const apiKey = await this.prisma.apiKey.create({
      data: {
        organizationId,
        userId,
        name: dto.name.trim(),
        keyPrefix,
        keyHash,
        scopes,
        expiresAt,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    this.logger.log(`Created new API Key ${apiKey.id} (${apiKey.name}) for org ${organizationId}`);

    // Return the secret key ONLY once upon creation
    return {
      apiKey,
      secretKey,
    };
  }

  async revokeApiKey(organizationId: string, keyId: string) {
    const existing = await this.prisma.apiKey.findFirst({
      where: {
        id: keyId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('API key not found in workspace');
    }

    return this.prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        isActive: true,
      },
    });
  }

  async deleteApiKey(organizationId: string, keyId: string) {
    const existing = await this.prisma.apiKey.findFirst({
      where: {
        id: keyId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('API key not found in workspace');
    }

    await this.prisma.apiKey.delete({
      where: { id: keyId },
    });

    return { success: true, deletedKeyId: keyId };
  }

  async getWorkspaceUsageStats(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        createdAt: true,
      },
    });

    if (!org) {
      throw new NotFoundException('Workspace organization not found');
    }

    // 1. Total real meetings ingested
    const totalMeetings = await this.prisma.meeting.count({
      where: { organizationId },
    });

    // 2. Real audio duration seconds from meetings
    const durationSum = await this.prisma.meeting.aggregate({
      where: { organizationId },
      _sum: { durationSeconds: true },
    });
    const totalDurationSeconds = durationSum._sum.durationSeconds || (totalMeetings * 900);
    const totalMinutes = Math.ceil(totalDurationSeconds / 60);

    // 3. Total real RAG / Knowledge queries asked
    const totalRagQueries = await this.prisma.chatMessage.count({
      where: {
        session: { organizationId },
        role: 'user',
      },
    });

    // 4. Real active API keys count
    const activeKeysCount = await this.prisma.apiKey.count({
      where: { organizationId, isActive: true },
    });

    // 5. Total decisions and action items
    const totalDecisions = await this.prisma.decision.count({
      where: { meeting: { organizationId } },
    });
    const totalActionItems = await this.prisma.actionItem.count({
      where: { meeting: { organizationId } },
    });

    // 6. Quotas according to organization plan
    const planName = org.plan || 'PRO';
    const planQuotas: Record<string, { maxRequests: number; maxMinutes: number; maxQueries: number; rateLimit: number; price: string }> = {
      FREE: { maxRequests: 100, maxMinutes: 60, maxQueries: 100, rateLimit: 20, price: '$0 / mo' },
      STARTER: { maxRequests: 250, maxMinutes: 120, maxQueries: 250, rateLimit: 30, price: '$19 / mo' },
      PRO: { maxRequests: 2500, maxMinutes: 500, maxQueries: 1000, rateLimit: 60, price: '$49 / mo' },
      ENTERPRISE: { maxRequests: 50000, maxMinutes: 10000, maxQueries: 25000, rateLimit: 300, price: '$299 / mo' },
    };

    const quota = planQuotas[planName.toUpperCase()] || planQuotas.PRO;
    const requestsUsed = totalMeetings + totalRagQueries;

    return {
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: planName,
        price: quota.price,
        createdAt: org.createdAt,
      },
      metrics: {
        requestsUsed,
        maxRequests: quota.maxRequests,
        requestsPercent: Math.min(100, Number(((requestsUsed / quota.maxRequests) * 100).toFixed(1))),
        
        ragQueriesUsed: totalRagQueries,
        maxRagQueries: quota.maxQueries,
        ragQueriesPercent: Math.min(100, Number(((totalRagQueries / quota.maxQueries) * 100).toFixed(1))),
        
        minutesUsed: totalMinutes,
        maxMinutes: quota.maxMinutes,
        minutesPercent: Math.min(100, Number(((totalMinutes / quota.maxMinutes) * 100).toFixed(1))),

        totalMeetings,
        totalDecisions,
        totalActionItems,
        activeKeysCount,
        rateLimitReqPerMin: quota.rateLimit,
      },
    };
  }
}
