import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { AuditService } from '@shared/audit/audit.service';
import { computeSpecificity } from '../domain/rule-matcher';
import { RuleBasis } from '../domain/types';

export interface CreateRuleInput {
  name: string;
  description?: string;
  productCategory?: string | null;
  minProfit?: string | null;
  maxProfit?: string | null;
  validFrom: string;
  validTo?: string | null;
  executionOrder: number;
  stackable: boolean;
  basis: RuleBasis;
  priority?: number;
  shares: { investorId: string; basisPoints: number }[];
  activate?: boolean;
}

@Injectable()
export class RuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(params: { activeAt?: string } = {}) {
    const at = params.activeAt ? new Date(params.activeAt) : undefined;
    return this.prisma.profitSharingRule.findMany({
      where: {
        deletedAt: null,
        ...(at
          ? { status: 'ACTIVE', validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] }
          : {}),
      },
      include: { shares: { include: { investor: { select: { id: true, name: true, code: true } } } } },
      orderBy: [{ executionOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.profitSharingRule.findUnique({
      where: { id },
      include: { shares: { include: { investor: true } }, supersededBy: true, supersedes: true },
    });
    if (!rule) throw new NotFoundException('Aturan tidak ditemukan');
    return rule;
  }

  async create(input: CreateRuleInput, actorId: string) {
    this.validateShares(input.shares);

    const validFrom = new Date(input.validFrom);
    const validTo = input.validTo ? new Date(input.validTo) : null;
    if (validTo && validTo <= validFrom) {
      throw new BadRequestException('Periode berakhir harus setelah periode mulai');
    }

    const minProfit = input.minProfit ? BigInt(input.minProfit) : null;
    const maxProfit = input.maxProfit ? BigInt(input.maxProfit) : null;
    if (minProfit !== null && maxProfit !== null && maxProfit < minProfit) {
      throw new BadRequestException('Batas atas laba harus ≥ batas bawah');
    }

    const rule = await this.prisma.profitSharingRule.create({
      data: {
        name: input.name,
        description: input.description,
        productCategory: input.productCategory ?? null,
        minProfit,
        maxProfit,
        validFrom,
        validTo,
        executionOrder: input.executionOrder,
        stackable: input.stackable,
        basis: input.basis,
        priority: input.priority ?? 0,
        specificity: computeSpecificity({
          productCategory: input.productCategory ?? null,
          minProfit,
          maxProfit,
          validTo,
        }),
        status: input.activate ? 'ACTIVE' : 'DRAFT',
        createdBy: actorId,
        shares: {
          create: input.shares.map((s) => ({ investorId: s.investorId, basisPoints: s.basisPoints })),
        },
      },
      include: { shares: { include: { investor: true } } },
    });
    await this.audit.log({ actorId, action: 'profit_rule.create', aggregateType: 'ProfitSharingRule', aggregateId: rule.id });
    return rule;
  }

  /**
   * Riwayat versi lengkap sebuah aturan — bukan cuma tetangga langsung
   * (`supersededBy`/`supersedes` di `findOne`), tapi seluruh rantai dari
   * versi PERTAMA sampai versi TERBARU, ditelusuri lewat `supersededById`.
   * Dipakai layar linimasa: "aturan apa yang aktif 3 bulan lalu?" terjawab
   * dari sini, bukan dari menebak tanggal.
   */
  async history(id: string) {
    const rule = await this.findOne(id);

    let head = rule;
    while (head.supersedes) {
      head = await this.findOne(head.supersedes.id);
    }

    const chain = [head];
    let cursor = head;
    while (cursor.supersededBy) {
      cursor = await this.findOne(cursor.supersededBy.id);
      chain.push(cursor);
    }

    return chain.map((r) => ({
      id: r.id,
      name: r.name,
      version: r.version,
      status: r.status,
      validFrom: r.validFrom,
      validTo: r.validTo,
      createdAt: r.createdAt,
    }));
  }

  /**
   * "Ubah" aturan = buat VERSI BARU, tutup yang lama.
   *
   * Inilah mekanisme yang mewujudkan janji inti studi kasus: skema bagi hasil
   * boleh diubah kapan saja, dan transaksi yang sudah berjalan tidak ikut
   * berubah. Aturan lama tetap utuh di database sebagai catatan sejarah —
   * bukan ditimpa.
   */
  async supersede(id: string, input: CreateRuleInput, actorId: string) {
    const old = await this.findOne(id);
    if (old.status === 'SUPERSEDED') {
      throw new BadRequestException('Aturan ini sudah digantikan versi lain');
    }
    this.validateShares(input.shares);

    const now = new Date();
    const validFrom = new Date(input.validFrom);
    const minProfit = input.minProfit ? BigInt(input.minProfit) : null;
    const maxProfit = input.maxProfit ? BigInt(input.maxProfit) : null;
    const validTo = input.validTo ? new Date(input.validTo) : null;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.profitSharingRule.create({
        data: {
          name: input.name,
          description: input.description,
          productCategory: input.productCategory ?? null,
          minProfit,
          maxProfit,
          validFrom,
          validTo,
          executionOrder: input.executionOrder,
          stackable: input.stackable,
          basis: input.basis,
          priority: input.priority ?? 0,
          specificity: computeSpecificity({
            productCategory: input.productCategory ?? null,
            minProfit,
            maxProfit,
            validTo,
          }),
          status: 'ACTIVE',
          version: old.version + 1,
          createdBy: actorId,
          shares: {
            create: input.shares.map((s) => ({ investorId: s.investorId, basisPoints: s.basisPoints })),
          },
        },
        include: { shares: { include: { investor: true } } },
      });

      // Trigger database melarang isi aturan diubah; menutup masa berlaku dan
      // menandai status masih diizinkan — dan hanya itu yang kita lakukan.
      await tx.profitSharingRule.update({
        where: { id: old.id },
        data: { status: 'SUPERSEDED', validTo: now, supersededById: created.id },
      });

      await this.audit.log(
        {
          actorId,
          action: 'profit_rule.supersede',
          aggregateType: 'ProfitSharingRule',
          aggregateId: created.id,
          metadata: { supersedes: old.id },
        },
        tx,
      );

      return created;
    });
  }

  async activate(id: string, actorId: string) {
    const rule = await this.findOne(id);
    if (rule.status !== 'DRAFT') throw new BadRequestException('Hanya aturan DRAFT yang bisa diaktifkan');
    if (rule.shares.length === 0) throw new BadRequestException('Aturan tanpa investor tidak bisa diaktifkan');
    const updated = await this.prisma.profitSharingRule.update({ where: { id }, data: { status: 'ACTIVE' } });
    await this.audit.log({ actorId, action: 'profit_rule.activate', aggregateType: 'ProfitSharingRule', aggregateId: id });
    return updated;
  }

  async softDelete(id: string, actorId: string) {
    const rule = await this.findOne(id);
    if (rule.isSystemDefault) throw new BadRequestException('Aturan cadangan sistem tidak bisa dihapus');
    const updated = await this.prisma.profitSharingRule.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'SUPERSEDED', validTo: new Date() },
    });
    await this.audit.log({ actorId, action: 'profit_rule.delete', aggregateType: 'ProfitSharingRule', aggregateId: id });
    return updated;
  }

  private validateShares(shares: { investorId: string; basisPoints: number }[]): void {
    if (shares.length === 0) throw new BadRequestException('Minimal satu investor');

    const ids = new Set(shares.map((s) => s.investorId));
    if (ids.size !== shares.length) throw new BadRequestException('Investor tidak boleh ganda dalam satu aturan');

    for (const s of shares) {
      if (!Number.isInteger(s.basisPoints) || s.basisPoints <= 0) {
        throw new BadRequestException('Persentase harus bilangan bulat basis point di atas 0');
      }
    }

    const total = shares.reduce((acc, s) => acc + s.basisPoints, 0);
    if (total > 10_000) {
      throw new BadRequestException(
        `Total persentase ${(total / 100).toFixed(2)}% melebihi 100%. Kurangi salah satu porsi.`,
      );
    }
  }
}
