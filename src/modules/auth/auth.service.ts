import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SupabaseSyncDto } from './dto/supabase-sync.dto';
import { Role, MeetingSource } from '@prisma/client';

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
    try {
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

      // Atomic nested write: creates user, organization, and owner membership in 1 query
      const user = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email: normalizedEmail,
          passwordHash,
          status: 'ACTIVE',
          memberships: {
            create: {
              role: Role.OWNER,
              organization: {
                create: {
                  name: orgName,
                  slug: orgSlug,
                  plan: 'FREE',
                },
              },
            },
          },
        },
        include: {
          memberships: {
            include: {
              organization: true,
            },
          },
        },
      });

      const activeMembership = user.memberships[0];
      const token = this.signToken({
        sub: user.id,
        email: user.email,
        organizationId: activeMembership.organizationId,
        role: activeMembership.role,
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        currentOrganization: {
          id: activeMembership.organization.id,
          name: activeMembership.organization.name,
          slug: activeMembership.organization.slug,
          role: activeMembership.role,
        },
      };
    } catch (err: any) {
      this.logger.error(`Register error: ${err.message}`, err.stack);
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(err.message || 'Registration failed');
    }
  }

  async login(dto: LoginDto) {
    try {
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
    } catch (err: any) {
      this.logger.error(`Login error: ${err.message}`, err.stack);
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(err.message || 'Login failed');
    }
  }

  async syncSupabaseSession(dto: SupabaseSyncDto) {
    try {
      let email = dto.email?.trim().toLowerCase();
      let name = dto.name?.trim();

      // Verify token with Supabase Admin SDK if available
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
        } catch (err: any) {
          this.logger.warn(`Supabase token verification note: ${err?.message || err}`);
        }
      }

      if (!email) {
        throw new UnauthorizedException('Unable to resolve user email from Supabase OAuth session');
      }

      name = name || email.split('@')[0];

      const orgName = `${name}'s Workspace`;
      const orgSlug = this.generateSlug(orgName);

      // Upsert user to handle both new registrations and existing records safely
      let user = await this.prisma.user.upsert({
        where: { email },
        update: {
          name,
          status: 'ACTIVE',
        },
        create: {
          email,
          name,
          status: 'ACTIVE',
          memberships: {
            create: {
              role: Role.OWNER,
              organization: {
                create: {
                  name: orgName,
                  slug: orgSlug,
                  plan: 'FREE',
                },
              },
            },
          },
        },
        include: {
          memberships: {
            include: {
              organization: true,
            },
          },
        },
      });

      // If user existed without any active organization, provision default workspace
      if (!user.memberships || user.memberships.length === 0) {
        await this.prisma.organization.create({
          data: {
            name: orgName,
            slug: orgSlug,
            plan: 'FREE',
            members: {
              create: {
                userId: user.id,
                role: Role.OWNER,
              },
            },
          },
        });

        const reloaded = await this.prisma.user.findUnique({
          where: { id: user.id },
          include: {
            memberships: {
              include: {
                organization: true,
              },
            },
          },
        });

        if (reloaded) {
          user = reloaded;
        }
      }

      if (!user) {
        throw new NotFoundException('Failed to provision user profile');
      }

      const activeMembership = user.memberships[0];
      const organizationId = activeMembership?.organizationId;
      const role = activeMembership?.role || Role.MEMBER;

      // Auto-provision Google Calendar & Meet integration if Supabase provided Google OAuth tokens
      if (organizationId && dto.providerToken && dto.provider === 'google') {
        try {
          const freshExpiresAt = new Date(Date.now() + 3600 * 1000);
          const existingIntegration = await this.prisma.integration.findFirst({
            where: {
              organizationId,
              provider: MeetingSource.GOOGLE_MEET,
            },
          });

          if (existingIntegration) {
            await this.prisma.integration.update({
              where: { id: existingIntegration.id },
              data: {
                encryptedAccessToken: dto.providerToken,
                ...(dto.providerRefreshToken && { encryptedRefreshToken: dto.providerRefreshToken }),
                expiresAt: freshExpiresAt,
                providerUserId: email,
                status: 'ACTIVE',
                scopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.readonly',
              },
            });
          } else {
            await this.prisma.integration.create({
              data: {
                organizationId,
                provider: MeetingSource.GOOGLE_MEET,
                encryptedAccessToken: dto.providerToken,
                encryptedRefreshToken: dto.providerRefreshToken,
                expiresAt: freshExpiresAt,
                providerUserId: email,
                status: 'ACTIVE',
                scopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.readonly',
              },
            });
          }
          this.logger.log(`Google Calendar & Meet integration automatically provisioned via Supabase OAuth for ${email}`);
        } catch (intErr: any) {
          this.logger.warn(`Could not auto-provision Google integration from Supabase OAuth token: ${intErr.message}`);
        }
      }

      // Auto-provision Microsoft Teams integration if Supabase provided Azure/Microsoft OAuth tokens
      if (organizationId && dto.providerToken && (dto.provider === 'azure' || dto.provider === 'microsoft')) {
        try {
          // Decode unencrypted JWT claims for logging
          try {
            const parts = dto.providerToken.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
              this.logger.log(
                `Microsoft Token Claims -> aud: ${payload.aud}, scp: ${payload.scp || payload.roles || 'none'}, exp: ${new Date(payload.exp * 1000).toISOString()}`,
              );
            }
          } catch (jwtErr) {
            this.logger.warn(`Could not parse token claims: ${jwtErr}`);
          }

          const freshExpiresAt = new Date(Date.now() + 3600 * 1000);
          const existingIntegration = await this.prisma.integration.findFirst({
            where: {
              organizationId,
              provider: MeetingSource.MICROSOFT_TEAMS,
            },
          });

          const microsoftScopes =
            'openid email profile offline_access Calendars.Read Calendars.ReadWrite OnlineMeetings.Read OnlineMeetings.ReadWrite OnlineMeetingTranscript.Read.All User.Read';

          if (existingIntegration) {
            await this.prisma.integration.update({
              where: { id: existingIntegration.id },
              data: {
                encryptedAccessToken: dto.providerToken,
                ...(dto.providerRefreshToken && { encryptedRefreshToken: dto.providerRefreshToken }),
                expiresAt: freshExpiresAt,
                providerUserId: email,
                status: 'ACTIVE',
                scopes: microsoftScopes,
              },
            });
          } else {
            await this.prisma.integration.create({
              data: {
                organizationId,
                provider: MeetingSource.MICROSOFT_TEAMS,
                encryptedAccessToken: dto.providerToken,
                encryptedRefreshToken: dto.providerRefreshToken,
                expiresAt: freshExpiresAt,
                providerUserId: email,
                status: 'ACTIVE',
                scopes: microsoftScopes,
              },
            });
          }
          this.logger.log(`Microsoft Teams integration automatically provisioned via Supabase OAuth for ${email}`);
        } catch (intErr: any) {
          this.logger.warn(`Could not auto-provision Microsoft Teams integration from Supabase OAuth token: ${intErr.message}`);
        }
      }

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
    } catch (err: any) {
      this.logger.error(`Error in syncSupabaseSession: ${err.message}`, err.stack);
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(err.message || 'Failed to synchronize OAuth session');
    }
  }

  async getProfile(userId: string) {
    try {
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
    } catch (err: any) {
      this.logger.error(`getProfile error: ${err.message}`, err.stack);
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(err.message || 'Failed to retrieve profile');
    }
  }

  private signToken(payload: {
    sub: string;
    email: string;
    organizationId?: string;
    role?: string;
  }): string {
    const secret = this.configService.get<string>(
      'JWT_SECRET',
      'meetingos_jwt_super_secret_dev_key_change_in_prod',
    );
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '7d');
    return this.jwtService.sign(payload, { secret, expiresIn: expiresIn as any });
  }
}
