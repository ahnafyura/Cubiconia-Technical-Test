import { Money } from '@shared/domain/money';

export enum RuleBasis {
  GROSS = 'GROSS',
  RESIDUAL = 'RESIDUAL',
}

export interface InvestorShare {
  investorId: string;
  investorName: string;
  /** Basis point: 2550 = 25,50 % */
  basisPoints: number;
}

/** Bentuk rule yang dipakai domain — bebas dari Prisma dan bebas dari NestJS. */
export interface RuleSpec {
  id: string;
  name: string;
  version: number;

  productCategory: string | null;
  minProfit: bigint | null;
  maxProfit: bigint | null;
  validFrom: Date;
  validTo: Date | null;

  executionOrder: number;
  stackable: boolean;
  basis: RuleBasis;
  priority: number;
  specificity: number;
  isSystemDefault: boolean;

  createdAt: Date;
  shares: InvestorShare[];
}

export interface TransactionContext {
  transactionId: string;
  productCategory: string;
  netProfit: bigint;
  occurredAt: Date;
}

export interface AllocationEntry {
  investorId: string;
  investorName: string;
  basisPoints: number;
  amount: Money;
}

export interface DistributionLayerResult {
  layerIndex: number;
  rule: RuleSpec;
  basisType: RuleBasis;
  /** Nilai yang jadi dasar hitung lapisan ini — berubah tiap lapisan pada mode RESIDUAL */
  basisAmount: Money;
  /** Yang benar-benar terpakai setelah kemungkinan clamp */
  allocatedAmount: Money;
  /** Sisa setelah lapisan ini dijalankan */
  remainingAfter: Money;
  clamped: boolean;
  entries: AllocationEntry[];
}

export interface DistributionResult {
  netProfit: Money;
  layers: DistributionLayerResult[];
  totalDistributed: Money;
  retainedByCompany: Money;
  isFallback: boolean;
  overAllocated: boolean;
}

/** Pagar keras: rantai tidak pernah lebih panjang dari ini. */
export const MAX_DISTRIBUTION_LAYERS = 10;
