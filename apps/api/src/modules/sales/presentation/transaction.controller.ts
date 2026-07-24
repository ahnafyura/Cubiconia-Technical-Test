import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { TransactionService } from '../application/transaction.service';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Idempotent } from '@shared/idempotency/idempotent.decorator';
import type { Principal } from '@shared/guards/jwt-auth.guard';

const CreateSchema = z.object({
  productId: z.string().uuid(),
  customerId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactions: TransactionService) {}

  @Get()
  async list(@Query('status') status?: string, @Query('take') take?: string, @Query('skip') skip?: string) {
    const result = await this.transactions.list({
      status,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
    return { data: result.items, meta: { total: result.total } };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.transactions.findOne(id) };
  }

  @Post()
  @RequirePermission('transaction:create')
  @Idempotent()
  async create(@Body() body: unknown, @CurrentUser() user: Principal) {
    return { data: await this.transactions.create(CreateSchema.parse(body), user.sub) };
  }

  @Post(':id/complete')
  @RequirePermission('transaction:create')
  @Idempotent()
  async complete(@Param('id') id: string, @CurrentUser() user: Principal) {
    return { data: await this.transactions.complete(id, user.sub) };
  }
}
