import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent';

/**
 * Tandai endpoint yang mengubah uang/data sensitif sebagai wajib aman
 * terhadap pengiriman ganda. Efeknya baru aktif kalau KLIEN mengirim header
 * `Idempotency-Key` — tanpa header itu, endpoint tetap jalan seperti biasa
 * (bukan mewajibkan setiap klien lama berhenti bekerja).
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
