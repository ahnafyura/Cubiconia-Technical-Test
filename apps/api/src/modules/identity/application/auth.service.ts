import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '@infra/database/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });

    // Pesan yang sama untuk email tak dikenal dan password salah — membedakan
    // keduanya membocorkan alamat email mana yang terdaftar.
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Email atau kata sandi salah');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Akun tidak aktif');
    }

    const permissions = [
      ...new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key))),
    ];
    const roles = user.roles.map((r) => r.role.key);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email, roles, permissions }),
      user: { id: user.id, email: user.email, displayName: user.displayName, roles, permissions },
    };
  }
}
