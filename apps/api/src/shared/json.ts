/**
 * BigInt tidak punya representasi JSON bawaan. Nominal uang dikirim sebagai
 * STRING — JSON `number` adalah IEEE-754 double yang kehilangan presisi di atas
 * 2^53, dan akumulasi nilai rupiah bisa melewati batas itu.
 */
export function installBigIntSerializer(): void {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
    return this.toString();
  };
}
