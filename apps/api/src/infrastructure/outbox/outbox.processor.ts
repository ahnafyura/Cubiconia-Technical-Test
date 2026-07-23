import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@infra/database/prisma.service';
import { DistributionService } from '@modules/profit-sharing/application/distribution.service';
import { loadEnv } from '@/config/env';

const env = loadEnv();
const MAX_ATTEMPTS = 5;

/**
 * Poller outbox.
 *
 * `FOR UPDATE SKIP LOCKED` memberi semantik antrean yang aman untuk banyak
 * instance sekaligus, tanpa broker terpisah — inilah yang membuat MVP ini cukup
 * dilayani satu database, dan membuat deployment tuntas dalam waktu yang ada.
 * Saat beban benar-benar menuntut broker sungguhan, yang berubah hanya kelas ini.
 */
@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly distribution: DistributionService,
  ) {}

  @Interval(env.OUTBOX_POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    if (this.running) return; // jangan menumpuk kalau satu putaran masih jalan
    this.running = true;
    try {
      await this.drain();
    } catch (err) {
      this.logger.error(`Putaran outbox gagal: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async drain(): Promise<void> {
    const batch = await this.prisma.$queryRaw<
      { id: string; event_type: string; aggregate_id: string }[]
    >`
      SELECT id, event_type, aggregate_id
      FROM outbox_events
      WHERE processed_at IS NULL AND attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at ASC
      LIMIT 20
      FOR UPDATE SKIP LOCKED
    `;

    for (const event of batch) {
      try {
        await this.handle(event.event_type, event.aggregate_id);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
      } catch (err) {
        const message = (err as Error).message;
        this.logger.warn(`Event ${event.event_type} (${event.id}) gagal: ${message}`);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { attempts: { increment: 1 }, lastError: message },
        });
      }
    }
  }

  private async handle(eventType: string, aggregateId: string): Promise<void> {
    switch (eventType) {
      case 'TransactionCompleted':
        await this.distribution.distribute(aggregateId);
        break;
      case 'ProfitDistributed':
        // Sudah ditangani di dalam transaksi distribusi; event ini disimpan
        // sebagai jejak dan titik sambung untuk consumer di masa depan.
        break;
      default:
        this.logger.warn(`Tidak ada handler untuk event ${eventType}`);
    }
  }
}
