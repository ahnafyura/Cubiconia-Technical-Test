import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';

type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0] | PrismaService;

/**
 * Satu titik tulis untuk seluruh jejak audit — dipanggil dari service lain
 * setelah (atau di dalam) mutasi yang mereka lakukan sendiri. AuditService
 * tidak pernah menyimpulkan "apa yang terjadi" dari membaca database; pemanggil
 * yang paling tahu konteksnya harus bilang eksplisit.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    input: {
      actorId: string | null;
      action: string;
      aggregateType: string;
      aggregateId: string;
      metadata?: Record<string, unknown>;
      requestId?: string;
    },
    tx: TxClient = this.prisma,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        metadata: input.metadata as never,
        requestId: input.requestId,
      },
    });
  }

  async list(params: { aggregateType?: string; actorId?: string; take?: number; skip?: number }) {
    const where: Record<string, unknown> = {};
    if (params.aggregateType) where.aggregateType = params.aggregateType;
    if (params.actorId) where.actorId = params.actorId;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.take ?? 50,
        skip: params.skip ?? 0,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}
