import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { TransactionService } from '../application/transaction.service';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';

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
  async create(@Body() body: unknown) {
    return { data: await this.transactions.create(CreateSchema.parse(body)) };
  }

  @Post(':id/complete')
  @RequirePermission('transaction:create')
  async complete(@Param('id') id: string) {
    return { data: await this.transactions.complete(id) };
  }
}
