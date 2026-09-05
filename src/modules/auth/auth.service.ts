import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SupabaseSyncDto } from './dto/supabase-sync.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly supabaseAdmin: SupabaseClient | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseSecret =
      this.configService.get<string>('SUPABASE_SECRET_KEY') ||
      this.configService.get<string>('SUPABASE_PUBLISHABLE_KEY');

    if (supabaseUrl && supabaseSecret) {
      this.supabaseAdmin = createClient(supabaseUrl, supabaseSecret, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      this.logger.log('Supabase Auth Client initialized successfully');
    }
  }

  private generateSlug(baseName: string): string {
    const sanitized = baseName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    return `${sanitized || 'workspace'}-${randomSuffix}`;
  }

  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const orgName = dto.organizationName?.trim() || `${dto.name.trim()}'s Workspace`;
    const orgSlug = this.generateSlug(orgName);

    // Create User, default Organization, and OWNER Membership in a single transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name.trim(),
          email: normalizedEmail,
          passwordHash,
          status: 'ACTIVE',
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: orgName,
          slug: orgSlug,
          plan: 'FREE',
        },
      });

      const membership = await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: Role.OWNER,
        },
      });

      return { user, organization, membership };
    });

    const token = this.signToken({
      sub: result.user.id,
      email: result.user.email,
      organizationId: result.organization.id,
      role: result.membership.role,
    });

    return {
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      currentOrganization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
        role: result.membership.role,
      },
    };
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    const activeMembership = user.memberships[0];
    const organizationId = activeMembership?.organizationId;
    const role = activeMembership?.role || Role.MEMBER;

    const token = this.signToken({
      sub: user.id,
      email: user.email,
      organizationId,
      role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      currentOrganization: activeMembership
        ? {
            id: activeMembership.organization.id,
            name: activeMembership.organization.name,
            slug: activeMembership.organization.slug,
            role: activeMembership.role,
          }
        : null,
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    };
  }

  async syncSupabaseSession(dto: SupabaseSyncDto) {
    let email = dto.email?.trim().toLowerCase();
    let name = dto.name?.trim();

    // Verify token with Supabase if client is available
    if (this.supabaseAdmin && dto.accessToken) {
      try {
        const { data, error } = await this.supabaseAdmin.auth.getUser(dto.accessToken);
        if (!error && data?.user?.email) {
          email = data.user.email.toLowerCase();
          name =
            name ||
            data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name ||
            email.split('@')[0];
        }
      } catch (err) {
        this.logger.warn(`Failed to verify Supabase token via admin SDK: ${err}`);
      }
    }

    if (!email) {
      throw new UnauthorizedException('Unable to resolve user email from Supabase OAuth session');
    }

    name = name || email.split('@')[0];

    // Find or create local user
    let user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      const orgName = `${name}'s Workspace`;
      const orgSlug = this.generateSlug(orgName);

      const created = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            name,
            status: 'ACTIVE',
          },
        });

        const newOrg = await tx.organization.create({
          data: {
            name: orgName,
            slug: orgSlug,
            plan: 'FREE',
          },
        });

        const newMembership = await tx.organizationMember.create({
          data: {
            organizationId: newOrg.id,
            userId: newUser.id,
            role: Role.OWNER,
          },
        });

        return { newUser, newOrg, newMembership };
      });

      user = await this.prisma.user.findUnique({
        where: { id: created.newUser.id },
        include: {
          memberships: {
            include: {
              organization: true,
            },
          },
        },
      });
    }

    if (!user) {
      throw new NotFoundException('Failed to provision user profile');
    }

    const activeMembership = user.memberships[0];
    const organizationId = activeMembership?.organizationId;
    const role = activeMembership?.role || Role.MEMBER;

    const token = this.signToken({
      sub: user.id,
      email: user.email,
      organizationId,
      role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      currentOrganization: activeMembership
        ? {
            id: activeMembership.organization.id,
            name: activeMembership.organization.name,
            slug: activeMembership.organization.slug,
            role: activeMembership.role,
          }
        : null,
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    };
  }

  private signToken(payload: {
    sub: string;
    email: string;
    organizationId?: string;
    role?: string;
  }): string {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '7d');
    return this.jwtService.sign(payload, { expiresIn });
  }
}
