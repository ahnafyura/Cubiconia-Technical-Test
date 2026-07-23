/**
 * Kontrak bersama API ↔ Web — satu-satunya sumber kebenaran bentuk data.
 *
 * Saat bentuk response berubah, `apps/web` gagal build seketika — bukan
 * menampilkan `NaN` ke pengguna di produksi.
 */

/**
 * Nominal uang selalu melintasi jaringan sebagai STRING.
 *
 * JSON `number` adalah IEEE-754 double yang kehilangan presisi di atas 2^53.
 * Alias ini membuat aturannya terbaca di setiap tempat pemakaian, bukan jadi
 * `string` polos yang niatnya hilang.
 */
export type MoneyString = string;

/** Basis point: 1/100 %. 2550 = 25,50 %. Integer, supaya bebas pecahan. */
export type BasisPoints = number;

export type RuleBasis = 'GROSS' | 'RESIDUAL';
export type RuleStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED';
export type TransactionStatus = 'DRAFT' | 'COMPLETED' | 'REFUNDED';
export type DistributionStatus =
  | 'CALCULATED'
  | 'PENDING_APPROVAL'
  | 'SETTLED'
  | 'REJECTED'
  | 'REVERSED';
export type LedgerEntryType = 'PROFIT_SHARE' | 'PAYOUT' | 'REVERSAL' | 'ADJUSTMENT';

// ── Amplop response ────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: { total?: number; requestId?: string };
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

// ── Identity ───────────────────────────────────────────────────────────────

export interface Principal {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string; displayName: string; roles: string[]; permissions: string[] };
}

// ── Bagi hasil ─────────────────────────────────────────────────────────────

export interface InvestorShareDto {
  investorId: string;
  investorName: string;
  basisPoints: BasisPoints;
}

/** Satu lapisan dalam rantai composable. */
export interface DistributionLayerDto {
  layerIndex: number;
  ruleId: string;
  ruleName: string;
  basisType: RuleBasis;
  /** Dasar hitung lapisan ini — berubah tiap lapisan pada mode RESIDUAL. */
  basisAmount: MoneyString;
  /** Hasil setelah kemungkinan clamp. */
  allocatedAmount: MoneyString;
  remainingAfter: MoneyString;
  clamped: boolean;
  entries: (InvestorShareDto & { amount: MoneyString })[];
}

/**
 * Hasil pipeline — dipakai bersama oleh simulasi dan distribusi tercatat,
 * karena keduanya memang menggambarkan perhitungan yang sama.
 *
 * Invarian: `totalDistributed + retainedByCompany === netProfit`, selalu.
 */
export interface DistributionResultDto {
  netProfit: MoneyString;
  totalDistributed: MoneyString;
  retainedByCompany: MoneyString;
  isFallback: boolean;
  overAllocated: boolean;
  layers: DistributionLayerDto[];
}

export interface SimulateRequest {
  productCategory: string;
  netProfit: MoneyString;
  occurredAt?: string;
}

export interface CreateRuleRequest {
  name: string;
  description?: string;
  productCategory?: string | null;
  minProfit?: MoneyString | null;
  maxProfit?: MoneyString | null;
  validFrom: string;
  validTo?: string | null;
  executionOrder: number;
  stackable: boolean;
  basis: RuleBasis;
  priority?: number;
  shares: { investorId: string; basisPoints: BasisPoints }[];
  activate?: boolean;
}

// ── Ledger ─────────────────────────────────────────────────────────────────

export interface LedgerEntryDto {
  id: string;
  entryType: LedgerEntryType;
  amount: MoneyString;
  balanceAfter: MoneyString;
  occurredAt: string;
  description: string | null;
}

export interface InvestorLedgerDto {
  balance: MoneyString;
  entries: LedgerEntryDto[];
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export interface DashboardSummaryDto {
  revenue: MoneyString;
  netProfit: MoneyString;
  distributed: MoneyString;
  retained: MoneyString;
  transactionCount: number;
  pendingApproval: number;
  flagged: number;
}

/** Endpoint yang WAJIB membawa header `Idempotency-Key` (keputusan C4). */
export const IDEMPOTENT_ENDPOINTS = [
  'POST /transactions',
  'POST /transactions/:id/complete',
  'POST /transactions/:id/refund',
  'POST /distributions/:id/approve',
  'POST /distributions/:id/reject',
  'POST /distributions/:id/reverse',
  'POST /payout-batches',
  'POST /payout-batches/:id/execute',
] as const;
