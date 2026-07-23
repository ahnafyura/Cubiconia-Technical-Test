/**
 * Money — nilai uang dalam satuan terkecil Rupiah.
 *
 * Aturan yang tidak bisa ditawar: uang tidak pernah menyentuh `number`.
 * `0.1 + 0.2 !== 0.3` adalah kelakar di kebanyakan aplikasi; di sistem bagi hasil
 * itu selisih yang harus dipertanggungjawabkan ke investor.
 *
 * Persentase disimpan sebagai *basis point* (1/100 %) agar seluruh jalur uang
 * bebas dari bilangan pecahan: 2550 bp = 25,50 %.
 */

export const BASIS_POINTS_DENOMINATOR = 10_000n;

export class Money {
  private constructor(private readonly minor: bigint) {}

  static readonly ZERO = new Money(0n);

  static from(value: bigint | number | string): Money {
    if (typeof value === 'bigint') return new Money(value);
    if (typeof value === 'string') return new Money(BigInt(value));
    if (!Number.isInteger(value)) {
      throw new Error(`Money menolak nilai pecahan: ${value}`);
    }
    return new Money(BigInt(value));
  }

  static sum(values: readonly Money[]): Money {
    return new Money(values.reduce((acc, m) => acc + m.minor, 0n));
  }

  get value(): bigint {
    return this.minor;
  }

  /** API mengirim uang sebagai string — JSON `number` kehilangan presisi di atas 2^53. */
  toJSON(): string {
    return this.minor.toString();
  }

  toString(): string {
    return this.minor.toString();
  }

  plus(other: Money): Money {
    return new Money(this.minor + other.minor);
  }

  minus(other: Money): Money {
    return new Money(this.minor - other.minor);
  }

  negated(): Money {
    return new Money(-this.minor);
  }

  times(factor: bigint): Money {
    return new Money(this.minor * factor);
  }

  isZero(): boolean {
    return this.minor === 0n;
  }

  isNegative(): boolean {
    return this.minor < 0n;
  }

  isPositive(): boolean {
    return this.minor > 0n;
  }

  greaterThan(other: Money): boolean {
    return this.minor > other.minor;
  }

  lessThan(other: Money): boolean {
    return this.minor < other.minor;
  }

  equals(other: Money): boolean {
    return this.minor === other.minor;
  }

  min(other: Money): Money {
    return this.minor <= other.minor ? this : other;
  }

  /**
   * Ambil porsi sebesar `basisPoints` dari nilai ini, dibulatkan KE BAWAH.
   *
   * Pembulatan ke bawah dipilih dengan sengaja: seluruh sisa pembulatan jatuh ke
   * perusahaan (keputusan A7), sehingga tidak pernah ada rupiah yang tercipta dari
   * ketiadaan. Membulatkan ke terdekat bisa membuat total alokasi melebihi dasarnya.
   */
  portion(basisPoints: number): Money {
    if (basisPoints < 0) throw new Error(`Basis point negatif: ${basisPoints}`);
    return new Money((this.minor * BigInt(basisPoints)) / BASIS_POINTS_DENOMINATOR);
  }

  /**
   * Bagi nilai ini menurut daftar basis point.
   *
   * Jaminannya: `sum(hasil) <= nilai ini`, selalu. Selisihnya adalah sisa
   * pembulatan yang dikembalikan lewat `remainder` — penelepon yang memutuskan
   * ke mana ia jatuh (di sistem ini: ke perusahaan).
   */
  allocate(shares: readonly { basisPoints: number }[]): {
    parts: Money[];
    allocated: Money;
    remainder: Money;
  } {
    const parts = shares.map((s) => this.portion(s.basisPoints));
    const allocated = Money.sum(parts);
    return { parts, allocated, remainder: this.minus(allocated) };
  }

  /**
   * Perkecil sekumpulan nilai secara proporsional agar totalnya muat dalam `cap`.
   *
   * Dipakai saat rantai rule salah dikonfigurasi hingga mengalokasikan lebih dari
   * yang tersedia. Distribusi tetap jalan — porsi dipotong proporsional dan
   * ditandai untuk ditinjau. Menggagalkan distribusi hanya akan menyandera profit
   * karena kesalahan yang bisa dikoreksi belakangan.
   */
  static scaleDownTo(parts: readonly Money[], cap: Money): Money[] {
    const total = Money.sum(parts);
    if (!total.greaterThan(cap) || total.isZero()) return [...parts];

    const scaled = parts.map((p) => new Money((p.minor * cap.minor) / total.minor));
    // Sisa akibat pembulatan ke bawah tetap di bawah cap — aman, dan sisanya
    // mengalir ke perusahaan seperti sisa pembulatan lainnya.
    return scaled;
  }
}

/** Format untuk tampilan. Dipakai di seed & log, bukan di jalur perhitungan. */
export function formatIDR(value: bigint | Money): string {
  const v = value instanceof Money ? value.value : value;
  const negative = v < 0n;
  const digits = (negative ? -v : v).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '−' : ''}Rp ${grouped}`;
}

/** 2550 bp → "25,5%" — dua desimal, nol tak berguna dibuang. */
export function formatBasisPoints(bp: number): string {
  const pct = bp / 100;
  return `${pct.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}%`;
}
