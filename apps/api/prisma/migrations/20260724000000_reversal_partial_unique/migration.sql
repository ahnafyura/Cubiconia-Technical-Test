-- ═══════════════════════════════════════════════════════════════════════════
--  Reversal butuh transaction_id yang boleh dipakai ulang — TAPI hanya oleh
--  baris reversal-nya sendiri.
--
--  profit_distributions.transaction_id sebelumnya UNIQUE penuh: itu benar
--  untuk distribusi ASLI (jaminan idempotensi, satu transaksi = satu
--  distribusi), tapi salah untuk distribusi REVERSAL — reversal secara
--  definisi menunjuk transaksi yang SAMA dengan distribusi yang ia
--  balikkan. Pola yang sama dengan idx_products_sku_unique di migrasi
--  sebelumnya: unique yang partial, bukan dihapus total.
-- ═══════════════════════════════════════════════════════════════════════════

DROP INDEX "profit_distributions_transaction_id_key";

-- Hanya distribusi ASLI (reversal_of IS NULL) yang tunduk pada "satu
-- transaksi, satu distribusi". Baris reversal (reversal_of IS NOT NULL)
-- dikecualikan — dan reversal sendiri sudah dijaga idempoten lewat
-- reversal_of yang UNIQUE (satu distribusi asli cuma boleh dibalik sekali,
-- lihat DistributionService.reverse).
CREATE UNIQUE INDEX idx_profit_distributions_transaction_unique
  ON profit_distributions (transaction_id)
  WHERE reversal_of IS NULL;
