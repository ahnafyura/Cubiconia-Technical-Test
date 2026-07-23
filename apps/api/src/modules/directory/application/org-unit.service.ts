import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';

@Injectable()
export class OrgUnitService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const units = await this.prisma.orgUnit.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { employees: { where: { deletedAt: null } } } } },
      orderBy: { name: 'asc' },
    });
    return units.map((u) => ({
      id: u.id,
      name: u.name,
      code: u.code,
      parentId: u.parentId,
      employeeCount: u._count.employees,
    }));
  }

  /**
   * Bagan organisasi sebagai pohon — dirakit dari parentId di memori
   * (closure table dipakai untuk query "semua bawahan X", bukan untuk
   * ini; membangun pohon dari parentId langsung lebih murah untuk N kecil).
   */
  async orgChart() {
    const units = await this.list();
    const byParent = new Map<string | null, typeof units>();
    for (const u of units) {
      const key = u.parentId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(u);
    }
    type Node = (typeof units)[number] & { children: Node[] };
    const build = (parentId: string | null): Node[] =>
      (byParent.get(parentId) ?? []).map((u) => ({ ...u, children: build(u.id) }));
    return build(null);
  }

  async create(input: { name: string; code: string; parentId?: string | null }) {
    if (input.parentId) {
      const parent = await this.prisma.orgUnit.findFirst({
        where: { id: input.parentId, deletedAt: null },
      });
      if (!parent) throw new NotFoundException('Unit induk tidak ditemukan');
    }

    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.orgUnit.create({
        data: { name: input.name, code: input.code, parentId: input.parentId ?? null },
      });

      // Baris diri sendiri (depth 0) — wajib ada supaya query "semua bawahan
      // termasuk diri sendiri" konsisten.
      await tx.orgUnitClosure.create({ data: { ancestorId: unit.id, descendantId: unit.id, depth: 0 } });

      // Salin seluruh rantai leluhur induk, depth +1, dengan unit baru sebagai
      // descendant — inilah yang membuat "semua bawahan Divisi X" jadi satu
      // JOIN, bukan rekursi berulang.
      if (input.parentId) {
        await tx.$executeRaw`
          INSERT INTO org_unit_closure (ancestor_id, descendant_id, depth)
          SELECT ancestor_id, ${unit.id}, depth + 1
          FROM org_unit_closure
          WHERE descendant_id = ${input.parentId}
        `;
      }

      return unit;
    });
  }

  /**
   * Pindahkan unit (dan seluruh bawahannya) ke induk baru.
   *
   * Algoritma closure-table standar: putus seluruh tautan leluhur LAMA untuk
   * subtree ini (di luar dirinya sendiri), lalu sambung ulang ke leluhur BARU.
   * Baris depth-0 (diri sendiri) tidak pernah disentuh.
   */
  async move(id: string, newParentId: string | null) {
    const unit = await this.prisma.orgUnit.findFirst({ where: { id, deletedAt: null } });
    if (!unit) throw new NotFoundException('Unit tidak ditemukan');

    if (newParentId) {
      if (newParentId === id) throw new BadRequestException('Unit tidak bisa jadi induk dirinya sendiri');
      const isDescendant = await this.prisma.orgUnitClosure.findUnique({
        where: { ancestorId_descendantId: { ancestorId: id, descendantId: newParentId } },
      });
      if (isDescendant) {
        throw new BadRequestException('Tidak bisa memindahkan unit ke bawah salah satu bawahannya sendiri, akan membentuk lingkaran');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Putuskan tautan leluhur lama untuk seluruh subtree (id + segala
      // bawahannya) — kecuali baris diri sendiri masing-masing node.
      await tx.$executeRaw`
        DELETE FROM org_unit_closure
        WHERE descendant_id IN (SELECT descendant_id FROM org_unit_closure WHERE ancestor_id = ${id})
          AND ancestor_id IN (
            SELECT ancestor_id FROM org_unit_closure WHERE descendant_id = ${id} AND ancestor_id != descendant_id
          )
      `;

      if (newParentId) {
        // Sambung ulang: setiap leluhur BARU × setiap node dalam subtree lama.
        await tx.$executeRaw`
          INSERT INTO org_unit_closure (ancestor_id, descendant_id, depth)
          SELECT p.ancestor_id, c.descendant_id, p.depth + c.depth + 1
          FROM org_unit_closure p, org_unit_closure c
          WHERE p.descendant_id = ${newParentId} AND c.ancestor_id = ${id}
        `;
      }

      return tx.orgUnit.update({ where: { id }, data: { parentId: newParentId } });
    });
  }

  async softDelete(id: string) {
    const unit = await this.prisma.orgUnit.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            children: { where: { deletedAt: null } },
            employees: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!unit) throw new NotFoundException('Unit tidak ditemukan');
    if (unit._count.children > 0) {
      throw new BadRequestException('Unit masih punya sub-unit aktif, pindahkan atau hapus dulu sub-unitnya');
    }
    if (unit._count.employees > 0) {
      throw new BadRequestException('Unit masih punya karyawan aktif, pindahkan dulu karyawannya');
    }
    return this.prisma.orgUnit.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
