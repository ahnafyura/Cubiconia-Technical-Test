import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { RuleBasis, RuleSpec } from '../domain/types';

type RuleRow = Awaited<ReturnType<PrismaService['profitSharingRule']['findFirst']>> & {
  shares: { investorId: string; basisPoints: number; investor: { name: string } }[];
};

/** Menerjemahkan baris Prisma menjadi bentuk domain yang bebas ORM. */
export function toRuleSpec(row: NonNullable<RuleRow>): RuleSpec {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    productCategory: row.productCategory,
    minProfit: row.minProfit,
    maxProfit: row.maxProfit,
    validFrom: row.validFrom,
    validTo: row.validTo,
    executionOrder: row.executionOrder,
    stackable: row.stackable,
    basis: row.basis as RuleBasis,
    priority: row.priority,
    specificity: row.specificity,
    isSystemDefault: row.isSystemDefault,
    createdAt: row.createdAt,
    shares: row.shares.map((s) => ({
      investorId: s.investorId,
      investorName: s.investor.name,
      basisPoints: s.basisPoints,
    })),
  };
}

@Injectable()
export class RuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ambil kandidat rule dari database.
   *
   * Penyaringan kasar dilakukan di SQL (status, kategori, periode) supaya tidak
   * menarik seluruh tabel; pencocokan halus dan penyusunan rantai dikerjakan di
   * domain, tempat aturannya bisa diuji tanpa database.
   */
  async findCandidates(params: { productCategory: string; at: Date }): Promise<RuleSpec[]> {
    const rows = await this.prisma.profitSharingRule.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        isSystemDefault: false,
        validFrom: { lte: params.at },
        OR: [{ validTo: null }, { validTo: { gte: params.at } }],
        AND: [{ OR: [{ productCategory: null }, { productCategory: params.productCategory }] }],
      },
      include: { shares: { include: { investor: { select: { name: true } } } } },
      orderBy: [{ executionOrder: 'asc' }, { priority: 'desc' }, { specificity: 'desc' }],
    });
    return rows.map((r) => toRuleSpec(r as NonNullable<RuleRow>));
  }

  async findActiveAt(at: Date): Promise<RuleSpec[]> {
    const rows = await this.prisma.profitSharingRule.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gte: at } }],
      },
      include: { shares: { include: { investor: { select: { name: true } } } } },
      orderBy: [{ executionOrder: 'asc' }],
    });
    return rows.map((r) => toRuleSpec(r as NonNullable<RuleRow>));
  }
}
