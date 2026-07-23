import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';

export interface EmployeeInput {
  fullName: string;
  email: string;
  phone?: string | null;
  position: string;
  orgUnitId?: string | null;
  managerId?: string | null;
}

@Injectable()
export class EmployeeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { search?: string; orgUnitId?: string; status?: 'active' | 'inactive' }) {
    const where: Record<string, unknown> = {};

    // "Nonaktif" itu status yang PALING butuh terlihat — manfaat directory
    // management adalah memutus akses saat karyawan keluar, jadi status
    // tidak boleh disembunyikan lewat filter default.
    if (params.status === 'inactive') where.deletedAt = { not: null };
    else if (params.status === 'active') where.deletedAt = null;

    if (params.orgUnitId) where.orgUnitId = params.orgUnitId;
    if (params.search) {
      where.OR = [
        { fullName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { position: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.employee.findMany({
      where,
      include: {
        orgUnit: { select: { id: true, name: true } },
        manager: { select: { id: true, fullName: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        orgUnit: { select: { id: true, name: true } },
        manager: { select: { id: true, fullName: true } },
        reports: { where: { deletedAt: null }, select: { id: true, fullName: true, position: true } },
      },
    });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    return employee;
  }

  async create(input: EmployeeInput) {
    await this.assertNoCycle(null, input.managerId ?? null);
    const employeeNo = await this.nextEmployeeNo();

    return this.prisma.employee.create({
      data: {
        employeeNo,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        position: input.position,
        orgUnitId: input.orgUnitId,
        managerId: input.managerId,
      },
      include: { orgUnit: { select: { id: true, name: true } }, manager: { select: { id: true, fullName: true } } },
    });
  }

  async update(id: string, input: EmployeeInput) {
    const existing = await this.prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Karyawan tidak ditemukan');
    if (input.managerId === id) throw new BadRequestException('Karyawan tidak bisa jadi atasan dirinya sendiri');
    await this.assertNoCycle(id, input.managerId ?? null);

    return this.prisma.employee.update({
      where: { id },
      data: {
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        position: input.position,
        orgUnitId: input.orgUnitId,
        managerId: input.managerId,
      },
      include: { orgUnit: { select: { id: true, name: true } }, manager: { select: { id: true, fullName: true } } },
    });
  }

  /**
   * Nonaktifkan akses — INI manfaat inti directory management. Soft delete,
   * bukan hapus permanen: riwayat (siapa pernah jadi atasan siapa, dst) tetap
   * utuh, dan akun bisa dipulihkan kalau karyawan kembali.
   */
  async deactivate(id: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    return this.prisma.employee.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async reactivate(id: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!employee) throw new NotFoundException('Karyawan (nonaktif) tidak ditemukan');
    return this.prisma.employee.update({ where: { id }, data: { deletedAt: null } });
  }

  /** Mencegah rantai atasan melingkar (A atasan B, B atasan A). */
  private async assertNoCycle(employeeId: string | null, managerId: string | null): Promise<void> {
    if (!managerId || !employeeId) return;
    let current: string | null = managerId;
    const seen = new Set<string>();
    while (current) {
      if (current === employeeId) {
        throw new BadRequestException('Rantai atasan tidak boleh melingkar');
      }
      if (seen.has(current)) break;
      seen.add(current);
      const m: { managerId: string | null } | null = await this.prisma.employee.findUnique({
        where: { id: current },
        select: { managerId: true },
      });
      current = m?.managerId ?? null;
    }
  }

  private async nextEmployeeNo(): Promise<string> {
    const count = await this.prisma.employee.count();
    return `EMP-${String(count + 1).padStart(4, '0')}`;
  }
}
