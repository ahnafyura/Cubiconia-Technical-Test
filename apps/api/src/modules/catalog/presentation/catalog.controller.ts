import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';

@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('products')
  async products() {
    return {
      data: await this.prisma.product.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      }),
    };
  }

  @Get('customers')
  async customers() {
    return {
      data: await this.prisma.customer.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      }),
    };
  }

  @Get('investors')
  async investors() {
    return {
      data: await this.prisma.investor.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      }),
    };
  }
}
