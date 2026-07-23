-- ═══════════════════════════════════════════════════════════════════════════
--  Append-only enforcement
--
--  Disiplin developer tidak cukup untuk sesuatu yang menyangkut uang. Baris
--  ledger dan distribusi tidak boleh diubah atau dihapus oleh SIAPA PUN —
--  termasuk oleh kode aplikasi yang salah tulis, migrasi yang ceroboh, atau
--  seseorang di psql jam 2 pagi.
--
--  Dipilih TRIGGER yang melempar exception, bukan RULE ... DO INSTEAD NOTHING:
--  no-op yang senyap akan menyembunyikan bug. Kalau ada yang mencoba mengubah
--  ledger, sistem harus berteriak — bukan diam lalu pura-pura berhasil.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Tabel % bersifat append-only: % ditolak. Koreksi dilakukan lewat entri pembalik, bukan mengubah baris lama.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_append_only
  BEFORE UPDATE OR DELETE ON investor_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER distribution_entries_append_only
  BEFORE UPDATE OR DELETE ON distribution_entries
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER distribution_layers_append_only
  BEFORE UPDATE OR DELETE ON distribution_layers
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- Distribusi boleh berpindah status (CALCULATED → SETTLED → REVERSED) dan
-- menerima jejak persetujuan, tapi angkanya tidak boleh disentuh sama sekali.
CREATE OR REPLACE FUNCTION reject_distribution_amount_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.net_profit          IS DISTINCT FROM OLD.net_profit
  OR NEW.total_distributed   IS DISTINCT FROM OLD.total_distributed
  OR NEW.retained_by_company IS DISTINCT FROM OLD.retained_by_company
  OR NEW.transaction_id      IS DISTINCT FROM OLD.transaction_id THEN
    RAISE EXCEPTION
      'Nominal distribusi bersifat immutable. Untuk mengoreksi, buat distribusi REVERSAL.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER distribution_amounts_immutable
  BEFORE UPDATE ON profit_distributions
  FOR EACH ROW EXECUTE FUNCTION reject_distribution_amount_change();

-- Rule tidak pernah di-UPDATE isinya. Perubahan skema = tutup yang lama, buka
-- versi baru. Yang boleh berubah hanya penutupan masa berlaku dan status.
CREATE OR REPLACE FUNCTION reject_rule_content_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_category IS DISTINCT FROM OLD.product_category
  OR NEW.min_profit       IS DISTINCT FROM OLD.min_profit
  OR NEW.max_profit       IS DISTINCT FROM OLD.max_profit
  OR NEW.basis            IS DISTINCT FROM OLD.basis
  OR NEW.stackable        IS DISTINCT FROM OLD.stackable
  OR NEW.execution_order  IS DISTINCT FROM OLD.execution_order
  OR NEW.valid_from       IS DISTINCT FROM OLD.valid_from THEN
    RAISE EXCEPTION
      'Isi aturan bersifat immutable setelah dibuat. Buat versi baru; sistem akan menutup versi lama.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rule_content_immutable
  BEFORE UPDATE ON profit_sharing_rules
  FOR EACH ROW EXECUTE FUNCTION reject_rule_content_change();

-- ═══════════════════════════════════════════════════════════════════════════
--  Partial index — membayar biaya soft delete
--
--  Index hanya memuat baris yang belum dihapus: lebih kecil, dan justru lebih
--  cepat daripada index biasa. Ini yang menghapus keberatan utama soft delete.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_products_active     ON products (category, created_at)  WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_active    ON customers (name)                 WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_active    ON employees (org_unit_id)          WHERE deleted_at IS NULL;
CREATE INDEX idx_investors_active    ON investors (name)                 WHERE deleted_at IS NULL;
CREATE INDEX idx_users_active        ON users (status)                   WHERE deleted_at IS NULL;

-- Unique yang tetap benar dengan soft delete: SKU yang sudah dihapus boleh
-- dipakai ulang. Tanpa ini, produk yang di-soft-delete memblokir SKU-nya selamanya.
CREATE UNIQUE INDEX idx_products_sku_unique       ON products (sku)          WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_employees_email_unique    ON employees (email)       WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_employees_extid_unique    ON employees (external_id) WHERE deleted_at IS NULL AND external_id IS NOT NULL;

-- Rule aktif dicari di setiap distribusi — indeks paling panas di sistem ini.
CREATE INDEX idx_rules_chain ON profit_sharing_rules (execution_order, priority DESC, specificity DESC)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;

-- Antrean outbox: poller hanya peduli baris yang belum diproses.
CREATE INDEX idx_outbox_pending ON outbox_events (created_at) WHERE processed_at IS NULL;

-- Antrean tinjauan admin: distribusi yang menunggu persetujuan atau ditandai.
CREATE INDEX idx_distributions_review ON profit_distributions (distributed_at DESC)
  WHERE status = 'PENDING_APPROVAL' OR is_fallback = true OR over_allocated = true;
