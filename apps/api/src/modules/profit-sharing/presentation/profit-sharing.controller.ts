import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '@infra/database/prisma.service';
import { RuleService } from '../application/rule.service';
import { DistributionService } from '../application/distribution.service';
import { RuleBasis } from '../domain/types';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import type { Principal } from '@shared/guards/jwt-auth.guard';

const ShareSchema = z.object({ investorId: z.string().uuid(), basisPoints: z.number().int().positive() });

const RuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  productCategory: z.string().nullable().optional(),
  minProfit: z.string().nullable().optional(),
  maxProfit: z.string().nullable().optional(),
  validFrom: z.string(),
  validTo: z.string().nullable().optional(),
  executionOrder: z.number().int().default(100),
  stackable: z.boolean().default(true),
  basis: z.nativeEnum(RuleBasis).default(RuleBasis.RESIDUAL),
  priority: z.number().int().default(0),
  shares: z.array(ShareSchema).min(1),
  activate: z.boolean().optional(),
});

const SimulateSchema = z.object({
  productCategory: z.string(),
  netProfit: z.string(),
  occurredAt: z.string().optional(),
});

@Controller()
export class ProfitSharingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RuleService,
    private readonly distribution: DistributionService,
  ) {}

  // ── Aturan ───────────────────────────────────────────────────────────────

  @Get('profit-rules')
  async listRules(@Query('activeAt') activeAt?: string) {
    return { data: await this.rules.list({ activeAt }) };
  }

  @Get('profit-rules/:id')
  async getRule(@Param('id') id: string) {
    return { data: await this.rules.findOne(id) };
  }

  @Post('profit-rules')
  @RequirePermission('profit_rule:create')
  async createRule(@Body() body: unknown, @CurrentUser() user: Principal) {
    return { data: await this.rules.create(RuleSchema.parse(body), user.sub) };
  }

  @Post('profit-rules/:id/supersede')
  @RequirePermission('profit_rule:create')
  async supersedeRule(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: Principal) {
    return { data: await this.rules.supersede(id, RuleSchema.parse(body), user.sub) };
  }

  @Post('profit-rules/:id/activate')
  @RequirePermission('profit_rule:create')
  async activateRule(@Param('id') id: string) {
    return { data: await this.rules.activate(id) };
  }

  @Delete('profit-rules/:id')
  @RequirePermission('profit_rule:create')
  async deleteRule(@Param('id') id: string) {
    return { data: await this.rules.softDelete(id) };
  }

  /**
   * Simulasi rantai — pengaman utama, bukan fitur pelengkap.
   *
   * Dengan rule composable, dampak sebuah aturan bergantung pada aturan lain
   * yang kebetulan cocok. Tanpa endpoint ini, admin menyimpan aturan sambil
   * menebak.
   */
  @Post('profit-rules/simulate')
  async simulate(@Body() body: unknown) {
    const input = SimulateSchema.parse(body);
    const result = await this.distribution.simulate({
      transactionId: 'simulasi',
      productCategory: input.productCategory,
      netProfit: BigInt(input.netProfit),
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    });

    return {
      data: {
        netProfit: result.netProfit.toJSON(),
        totalDistributed: result.totalDistributed.toJSON(),
        retainedByCompany: result.retainedByCompany.toJSON(),
        isFallback: result.isFallback,
        overAllocated: result.overAllocated,
        layers: result.layers.map((l) => ({
          layerIndex: l.layerIndex,
          ruleId: l.rule.id,
          ruleName: l.rule.name,
          basisType: l.basisType,
          basisAmount: l.basisAmount.toJSON(),
          allocatedAmount: l.allocatedAmount.toJSON(),
          remainingAfter: l.remainingAfter.toJSON(),
          clamped: l.clamped,
          entries: l.entries.map((e) => ({
            investorId: e.investorId,
            investorName: e.investorName,
            basisPoints: e.basisPoints,
            amount: e.amount.toJSON(),
          })),
        })),
      },
    };
  }

  // ── Distribusi ───────────────────────────────────────────────────────────
  //
  // `distribution:read:all` memberi visibilitas LINTAS investor — dipakai admin
  // & ops untuk melihat rantai penuh sebuah distribusi (semua penerima, semua
  // porsi). Investor TIDAK pernah mendapat izin ini; mereka dilayani lewat
  // `investors/me/distributions/:id` di bawah, yang menyaring hanya porsi
  // mereka sendiri sebelum data meninggalkan server sama sekali.

  @Get('distributions')
  @RequirePermission('distribution:read:all')
  async listDistributions(@Query('status') status?: string, @Query('flagged') flagged?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (flagged === 'true') where.OR = [{ isFallback: true }, { overAllocated: true }];

    return {
      data: await this.prisma.profitDistribution.findMany({
        where,
        include: {
          transaction: { include: { product: { select: { name: true, category: true } }, customer: { select: { name: true } } } },
          layers: { select: { id: true, layerIndex: true, ruleId: true } },
        },
        orderBy: { distributedAt: 'desc' },
        take: 50,
      }),
    };
  }

  /**
   * Jejak keputusan lengkap per lapisan: rule apa, dasar berapa, ambil berapa,
   * sisa berapa. Ini yang mengubah "kotak hitam bagi hasil" jadi sesuatu yang
   * bisa dipertanggungjawabkan ke investor.
   */
  @Get('distributions/:id')
  @RequirePermission('distribution:read:all')
  async getDistribution(@Param('id') id: string) {
    const dist = await this.prisma.profitDistribution.findUnique({
      where: { id },
      include: {
        transaction: { include: { product: true, customer: true } },
        layers: {
          orderBy: { layerIndex: 'asc' },
          include: {
            rule: { select: { id: true, name: true, version: true } },
            entries: { include: { investor: { select: { id: true, name: true, code: true } } } },
          },
        },
      },
    });
    if (!dist) return { data: null };

    // Ringkasan per investor menampilkan penjumlahan antar-lapisan secara
    // terbuka — investor yang muncul di dua lapisan adalah kasus paling
    // membingungkan, dan cara terbaik menanganinya adalah menunjukkan aritmatikanya.
    const perInvestor = new Map<string, { name: string; total: bigint; parts: { layer: number; amount: string }[] }>();
    for (const layer of dist.layers) {
      for (const e of layer.entries) {
        const cur = perInvestor.get(e.investorId) ?? { name: e.investor.name, total: 0n, parts: [] };
        cur.total += e.amount;
        cur.parts.push({ layer: layer.layerIndex + 1, amount: e.amount.toString() });
        perInvestor.set(e.investorId, cur);
      }
    }

    return {
      data: {
        ...dist,
        summary: [...perInvestor.entries()].map(([investorId, v]) => ({
          investorId,
          investorName: v.name,
          total: v.total.toString(),
          parts: v.parts,
        })),
      },
    };
  }

  @Post('distributions/:id/approve')
  @RequirePermission('distribution:approve')
  async approve(@Param('id') id: string, @CurrentUser() user: Principal) {
    await this.distribution.approve(id, user.sub);
    return { data: { id, status: 'SETTLED' } };
  }

  @Post('distributions/:id/reject')
  @RequirePermission('distribution:approve')
  async reject(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser() user: Principal) {
    await this.distribution.reject(id, user.sub, body?.reason ?? 'Tanpa alasan');
    return { data: { id, status: 'REJECTED' } };
  }

  // ── Investor — akses diri sendiri (self-service, tanpa permission gate) ──
  //
  // Tidak ada @RequirePermission di sini dengan SENGAJA. Keamanannya bukan dari
  // daftar izin, tapi dari struktur: investorId SELALU diturunkan dari
  // `user.sub` di token, tidak pernah dari parameter URL yang bisa ditebak
  // pengguna. Siapa pun yang login boleh memanggil endpoint ini — tapi hanya
  // akan pernah melihat datanya sendiri, karena tidak ada jalan untuk memasukkan
  // ID orang lain.
  //
  // URUTAN PENTING: rute statis (`investors/me/...`) HARUS terdaftar SEBELUM
  // rute dinamis (`investors/:id/...`) di bawahnya. NestJS mencocokkan rute
  // sesuai urutan pendaftaran method, bukan spesifisitas — kalau dibalik,
  // permintaan ke `/investors/me/ledger` akan tertangkap oleh handler
  // `:id/ledger` dengan `id = "me"`, dan setiap investor akan mendapat 404
  // "profil tidak ditemukan" karena "me" bukan UUID yang valid.

  @Get('investors/me')
  async myProfile(@CurrentUser() user: Principal) {
    const investor = await this.resolveInvestor(user.sub);
    return { data: { id: investor.id, code: investor.code, name: investor.name } };
  }

  @Get('investors/me/ledger')
  async myLedger(@CurrentUser() user: Principal) {
    const investor = await this.resolveInvestor(user.sub);
    return { data: await this.ledgerOf(investor.id) };
  }

  /** Tren 6 bulan terakhir untuk grafik portal — data ledger asli, bukan hiasan. */
  @Get('investors/me/trend')
  async myTrend(@CurrentUser() user: Principal) {
    const investor = await this.resolveInvestor(user.sub);
    return { data: await this.distribution.monthlyTrend(investor.id) };
  }

  /**
   * Versi investor dari `GET /distributions/:id/explain` — tapi disaring di
   * server, bukan di klien. Investor tidak pernah menerima payload berisi
   * porsi investor lain sama sekali; kalau mereka tidak punya porsi di
   * distribusi ini, responsnya 404, bukan array kosong yang membocorkan
   * bahwa distribusinya ada.
   */
  @Get('investors/me/distributions/:distributionId')
  async myDistributionExplain(
    @Param('distributionId') distributionId: string,
    @CurrentUser() user: Principal,
  ) {
    const investor = await this.resolveInvestor(user.sub);
    const result = await this.distribution.explainForInvestor(distributionId, investor.id);
    if (!result) {
      throw new NotFoundException('Distribusi tidak ditemukan atau bukan milik Anda');
    }
    return { data: result };
  }

  // ── Investor — akses admin (lintas investor, ID eksplisit) ────────────────

  @Get('investors/:id/ledger')
  @RequirePermission('investor:read:any')
  async ledger(@Param('id') id: string) {
    return { data: await this.ledgerOf(id) };
  }

  private async resolveInvestor(userId: string) {
    const investor = await this.prisma.investor.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!investor) {
      throw new NotFoundException('Akun ini tidak tertaut ke profil investor mana pun');
    }
    return investor;
  }

  private async ledgerOf(investorId: string) {
    const [entries, balance] = await Promise.all([
      this.prisma.investorLedgerEntry.findMany({
        where: { investorId },
        orderBy: { sequenceNo: 'desc' },
        take: 100,
        include: { distribution: { select: { id: true, code: true, transaction: { select: { code: true } } } } },
      }),
      this.distribution.balanceOf(investorId),
    ]);
    return { balance: balance.toJSON(), entries };
  }

  // ── Ringkasan dashboard ──────────────────────────────────────────────────

  @Get('dashboard/summary')
  @RequirePermission('distribution:read:all')
  async summary() {
    const [agg, distAgg, pending, flagged, recent, trend, byInvestor] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { revenue: true, netProfit: true },
        _count: true,
      }),
      this.prisma.profitDistribution.aggregate({
        _sum: { totalDistributed: true, retainedByCompany: true },
      }),
      this.prisma.profitDistribution.count({ where: { status: 'PENDING_APPROVAL' } }),
      this.prisma.profitDistribution.count({ where: { OR: [{ isFallback: true }, { overAllocated: true }] } }),
      this.prisma.transaction.findMany({
        where: { status: 'COMPLETED' },
        include: { product: { select: { name: true } }, customer: { select: { name: true } }, distribution: { select: { status: true } } },
        orderBy: { completedAt: 'desc' },
        take: 5,
      }),
      this.distribution.companyMonthlyTrend(),
      this.distribution.distributionByInvestor(),
    ]);

    return {
      data: {
        revenue: (agg._sum.revenue ?? 0n).toString(),
        netProfit: (agg._sum.netProfit ?? 0n).toString(),
        distributed: (distAgg._sum.totalDistributed ?? 0n).toString(),
        retained: (distAgg._sum.retainedByCompany ?? 0n).toString(),
        transactionCount: agg._count,
        pendingApproval: pending,
        flagged,
        recent,
        trend,
        byInvestor,
      },
    };
  }
}
