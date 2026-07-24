import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { loadEnv } from '@/config/env';

const env = loadEnv();

/**
 * Nilai konfigurasi yang admin boleh ubah TANPA deploy ulang, disimpan di
 * tabel `settings`. env.* tetap jadi NILAI AWAL (dipakai kalau baris belum
 * pernah diisi) — bukan diganti total, supaya seed/first-boot tetap punya
 * default yang aman.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getApprovalThresholdIdr(): Promise<bigint> {
    const row = await this.prisma.setting.findUnique({ where: { key: 'approval_threshold_idr' } });
    return row ? BigInt(row.value) : env.APPROVAL_THRESHOLD_IDR;
  }

  async setApprovalThresholdIdr(value: bigint): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key: 'approval_threshold_idr' },
      create: { key: 'approval_threshold_idr', value: value.toString() },
      update: { value: value.toString() },
    });
  }
}
