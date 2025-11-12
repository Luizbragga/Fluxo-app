import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

const ACCESS_TTL_SEC = 60 * 15; // 15 min
const REFRESH_TTL_SEC = 60 * 60 * 24 * 7; // 7 dias

type AccessPayload = { sub: string; tenantId: string; role: Role };
type RefreshPayload = { sub: string; tenantId: string };

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // ---------- helpers ----------
  private signAccess(user: AccessPayload) {
    return this.jwt.sign(
      { sub: user.sub, tenantId: user.tenantId, role: user.role },
      {
        secret: process.env.JWT_SECRET || 'changeme',
        expiresIn: ACCESS_TTL_SEC,
      },
    );
  }

  private signRefresh(user: RefreshPayload) {
    return this.jwt.sign(
      { sub: user.sub, tenantId: user.tenantId },
      {
        secret: process.env.JWT_REFRESH_SECRET || 'changeme',
        expiresIn: REFRESH_TTL_SEC,
      },
    );
  }

  // ---------- cadastro ----------
  async registerTenant(dto: RegisterTenantDto) {
    const role = dto.ownerRole ?? Role.owner;

    const exists = await this.prisma.user.findFirst({
      where: { email: dto.ownerEmail },
    });
    if (exists) {
      throw new BadRequestException('Email já cadastrado em algum tenant');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.tenantName, nif: dto.tenantNif ?? null },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          role,
          name: dto.ownerName,
          email: dto.ownerEmail,
          phone: dto.ownerPhone ?? null,
          passwordHash,
        },
      });
      return { tenant, user };
    });

    const access = this.signAccess({
      sub: user.id,
      tenantId: tenant.id,
      role: user.role,
    });
    const refresh = this.signRefresh({ sub: user.id, tenantId: tenant.id });
    await this.saveRefresh(user.id, refresh);

    return {
      tenant: { id: tenant.id, name: tenant.name },
      user: { id: user.id, role: user.role },
      tokens: { access, refresh },
    };
  }

  // ---------- login ----------
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, active: true },
    });
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');

    const access = this.signAccess({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    const refresh = this.signRefresh({ sub: user.id, tenantId: user.tenantId });
    await this.saveRefresh(user.id, refresh);

    return {
      user: { id: user.id, tenantId: user.tenantId, role: user.role },
      tokens: { access, refresh },
    };
  }

  // ---------- refresh (com rotação) ----------
  async refreshFromToken(refreshToken: string) {
    // 1) Verifica assinatura/expiração
    let decoded: any;
    try {
      decoded = this.jwt.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'changeme',
      });
    } catch {
      throw new UnauthorizedException('Refresh inválido');
    }

    const userId = decoded?.sub as string | undefined;
    if (!userId) throw new UnauthorizedException('Refresh inválido');

    // 2) Localiza o hash correspondente a ESTE refresh e confere expiração
    const rows = await this.prisma.refreshToken.findMany({ where: { userId } });

    let usedRowId: string | null = null;
    for (const r of rows) {
      const ok = await bcrypt.compare(refreshToken, r.tokenHash);
      if (ok && r.expiresAt > new Date()) {
        usedRowId = r.id;
        break;
      }
    }
    if (!usedRowId) throw new UnauthorizedException('Refresh inválido');

    // 3) Carrega usuário
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    // 4) Emite novo access e novo refresh usando 'sub'
    const access = this.signAccess({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    const newRefresh = this.signRefresh({
      sub: user.id,
      tenantId: user.tenantId,
    });

    // 5) Rotação: apaga o refresh usado e salva o novo
    // 5) Rotação: apaga o refresh usado e salva o novo (callback transaction)
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.delete({ where: { id: usedRowId! } });

      // salvar o novo refresh dentro da transação
      const decoded = this.jwt.decode(newRefresh) as { exp?: number } | null;
      const expSec =
        decoded?.exp ?? Math.floor(Date.now() / 1000) + REFRESH_TTL_SEC;
      const expiresAt = new Date(expSec * 1000);
      const tokenHash = await bcrypt.hash(newRefresh, 10);

      await tx.refreshToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
    });

    return { tokens: { access, refresh: newRefresh } };
  }

  // ---------- revogação (logout) ----------
  async revokeRefresh(refreshToken: string) {
    const decoded = this.jwt.decode(refreshToken) as { sub?: string } | null;
    if (!decoded?.sub) return;

    const rows = await this.prisma.refreshToken.findMany({
      where: { userId: decoded.sub },
    });

    for (const r of rows) {
      const ok = await bcrypt.compare(refreshToken, r.tokenHash);
      if (ok) {
        await this.prisma.refreshToken.delete({ where: { id: r.id } });
        break;
      }
    }
  }

  // ---------- persistência do refresh ----------
  private async saveRefresh(userId: string, refresh: string) {
    const decoded = this.jwt.decode(refresh) as { exp?: number } | null;
    const expSec =
      decoded?.exp ?? Math.floor(Date.now() / 1000) + REFRESH_TTL_SEC;
    const expiresAt = new Date(expSec * 1000);
    const tokenHash = await bcrypt.hash(refresh, 10);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }
}
