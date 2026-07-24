import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { AuditService } from '@shared/audit/audit.service';

@Injectable()
export class TransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(params: { status?: string; take?: number; skip?: number }) {
    const where = params.status ? { status: params.status as never } : {};
    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          product: { select: { name: true, category: true } },
          customer: { select: { name: true } },
          // reversalOfId: null → distribusi ASLI transaksi ini, bukan salah
          // satu reversal-nya (satu transaksi bisa punya keduanya sekarang).
          distributions: {
            where: { reversalOfId: null },
            select: { id: true, code: true, status: true, isFallback: true, overAllocated: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: params.take ?? 20,
        skip: params.skip ?? 0,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return { items: items.map(({ distributions, ...t }) => ({ ...t, distribution: distributions[0] ?? null })), total };
  }

  async findOne(id: string) {
    const trx = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        product: true,
        customer: true,
        distributions: {
          include: { layers: { include: { entries: { include: { investor: true } } } } },
          orderBy: { distributedAt: 'asc' },
        },
      },
    });
    if (!trx) throw new NotFoundException('Transaksi tidak ditemukan');
    const { distributions, ...rest } = trx;
    return {
      ...rest,
      distribution: distributions.find((d) => !d.reversalOfId) ?? null,
      // Reversal (kalau ada) dikirim terpisah, bukan disembunyikan — transaksi
      // yang sudah di-refund tetap harus bisa menunjukkan jejak pembalikannya.
      reversal: distributions.find((d) => d.reversalOfId) ?? null,
    };
  }

  /**
   * Buat transaksi. Harga dan biaya produksi di-SNAPSHOT dari produk saat ini —
   * kalau harga produk berubah besok, laba transaksi ini tidak ikut berubah.
   */
  async create(input: { productId: string; customerId: string; quantity: number }, actorId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Produk tidak ditemukan');
    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan');
    if (input.quantity < 1) throw new BadRequestException('Kuantitas minimal 1');

    const qty = BigInt(input.quantity);
    const revenue = product.price * qty;
    const productionCostTotal = product.productionCost * qty;

    const count = await this.prisma.transaction.count();
    const code = `TRX-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const trx = await this.prisma.transaction.create({
      data: {
        code,
        productId: product.id,
        customerId: input.customerId,
        quantity: input.quantity,
        unitPrice: product.price,
        unitProductionCost: product.productionCost,
        revenue,
        productionCostTotal,
        netProfit: revenue - productionCostTotal,
        status: 'DRAFT',
      },
      include: { product: true, customer: true },
    });
    await this.audit.log({ actorId, action: 'transaction.create', aggregateType: 'Transaction', aggregateId: trx.id });
    return trx;
  }

  /**
   * Selesaikan transaksi.
   *
   * Event diterbitkan lewat OUTBOX di dalam transaksi database yang sama —
   * bukan dipanggil langsung setelah commit. Kalau proses mati tepat setelah
   * commit, event tetap menunggu di tabel outbox dan diproses saat hidup lagi.
   * Tanpa ini, ada celah di mana transaksi tercatat tapi profitnya tidak pernah
   * terbagi.
   */
  async complete(id: string, actorId: string) {
    const trx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!trx) throw new NotFoundException('Transaksi tidak ditemukan');
    if (trx.status === 'COMPLETED') return trx; // idempoten
    if (trx.status === 'REFUNDED') throw new BadRequestException('Transaksi sudah di-refund');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: 'TransactionCompleted',
          aggregateType: 'Transaction',
          aggregateId: updated.id,
          payload: { transactionId: updated.id, netProfit: updated.netProfit.toString() },
        },
      });

      await this.audit.log(
        { actorId, action: 'transaction.complete', aggregateType: 'Transaction', aggregateId: updated.id },
        tx,
      );

      return updated;
    });
  }
}
