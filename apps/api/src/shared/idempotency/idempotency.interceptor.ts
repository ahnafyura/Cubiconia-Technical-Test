import { CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { PrismaService } from '@infra/database/prisma.service';
import { IDEMPOTENT_KEY } from './idempotent.decorator';

const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Pelindung dua-permintaan-sama di level HTTP — bukan pengganti unique
 * constraint di database (yang tetap jadi pagar terakhir, lihat
 * DistributionService.distribute), tapi lapisan sebelumnya: mencegah efek
 * samping ganda pada operasi yang TIDAK punya constraint natural sekuat itu,
 * misalnya membuat transaksi baru dua kali karena klik ganda atau retry jaringan.
 *
 * Kontrak: klien kirim header `Idempotency-Key` (UUID, dibuat sekali per aksi
 * logis, dipakai ulang persis kalau request yang sama diulang). Permintaan
 * kedua dengan key yang sama & body yang sama mengembalikan response yang
 * SAMA tanpa menjalankan handler lagi. Key yang sama dengan body BERBEDA
 * ditolak — itu tanda klien salah pakai key, bukan retry sungguhan.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const required = this.reflector.get<boolean>(IDEMPOTENT_KEY, context.getHandler());
    if (!required) return next.handle();

    const req = context.switchToHttp().getRequest();
    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key) return next.handle();

    const fingerprint = `${req.method} ${req.originalUrl ?? req.url} ${JSON.stringify(req.body ?? {})}`;

    return from(this.prisma.idempotencyKey.findUnique({ where: { key } })).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.fingerprint !== fingerprint) {
            throw new ConflictException('Idempotency-Key sudah dipakai untuk permintaan yang berbeda');
          }
          if (existing.status === 'COMPLETED') {
            return of(existing.response);
          }
          throw new ConflictException('Permintaan dengan Idempotency-Key ini masih diproses, coba lagi sesaat lagi');
        }

        return from(
          this.prisma.idempotencyKey.create({
            data: { key, fingerprint, status: 'IN_PROGRESS', expiresAt: new Date(Date.now() + TTL_MS) },
          }),
        ).pipe(
          switchMap(() =>
            next.handle().pipe(
              // switchMap, BUKAN tap — tap tidak pernah menunggu efek sampingnya
              // sendiri selesai (fire-and-forget), jadi respons HTTP bisa
              // terkirim ke klien SEBELUM baris idempotency-key benar-benar
              // ditandai COMPLETED. Race itu nyata: permintaan kedua yang
              // datang cepat sesudahnya masih melihat status IN_PROGRESS.
              // switchMap menahan emisi sampai tulisan DB-nya sungguh selesai.
              switchMap((result) =>
                from(
                  this.prisma.idempotencyKey.update({
                    where: { key },
                    data: { status: 'COMPLETED', response: (result ?? null) as object, statusCode: 200 },
                  }),
                ).pipe(switchMap(() => of(result))),
              ),
              catchError((err) => {
                // Gagal — hapus baris IN_PROGRESS supaya percobaan berikutnya
                // dengan key yang sama boleh dicoba ulang, bukan terkunci selamanya.
                void this.prisma.idempotencyKey.delete({ where: { key } }).catch(() => {});
                throw err;
              }),
            ),
          ),
        );
      }),
    );
  }
}
