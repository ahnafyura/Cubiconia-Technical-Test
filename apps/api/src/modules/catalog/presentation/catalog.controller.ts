import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { CatalogService } from '../application/catalog.service';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Idempotent } from '@shared/idempotency/idempotent.decorator';
import { AuditService } from '@shared/audit/audit.service';
import type { Principal } from '@shared/guards/jwt-auth.guard';

const ProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  price: z.string().regex(/^\d+$/),
  productionCost: z.string().regex(/^\d+$/),
});
const ProductUpdateSchema = ProductSchema.partial();
const CustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
});
const CustomerUpdateSchema = CustomerSchema.partial();

@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
  ) {}

  @Get('products')
  async products() {
    return { data: await this.catalog.listProducts() };
  }

  @Post('products')
  @RequirePermission('catalog:manage')
  @Idempotent()
  async createProduct(@Body() body: unknown, @CurrentUser() user: Principal) {
    const product = await this.catalog.createProduct(ProductSchema.parse(body));
    await this.audit.log({ actorId: user.sub, action: 'product.create', aggregateType: 'Product', aggregateId: product.id });
    return { data: product };
  }

  @Put('products/:id')
  @RequirePermission('catalog:manage')
  async updateProduct(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: Principal) {
    const product = await this.catalog.updateProduct(id, ProductUpdateSchema.parse(body));
    await this.audit.log({ actorId: user.sub, action: 'product.update', aggregateType: 'Product', aggregateId: id });
    return { data: product };
  }

  @Delete('products/:id')
  @RequirePermission('catalog:manage')
  async deleteProduct(@Param('id') id: string, @CurrentUser() user: Principal) {
    await this.catalog.deleteProduct(id);
    await this.audit.log({ actorId: user.sub, action: 'product.delete', aggregateType: 'Product', aggregateId: id });
    return { data: { ok: true } };
  }

  @Get('customers')
  async customers() {
    return { data: await this.catalog.listCustomers() };
  }

  @Post('customers')
  @RequirePermission('catalog:manage')
  @Idempotent()
  async createCustomer(@Body() body: unknown, @CurrentUser() user: Principal) {
    const customer = await this.catalog.createCustomer(CustomerSchema.parse(body));
    await this.audit.log({ actorId: user.sub, action: 'customer.create', aggregateType: 'Customer', aggregateId: customer.id });
    return { data: customer };
  }

  @Put('customers/:id')
  @RequirePermission('catalog:manage')
  async updateCustomer(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: Principal) {
    const customer = await this.catalog.updateCustomer(id, CustomerUpdateSchema.parse(body));
    await this.audit.log({ actorId: user.sub, action: 'customer.update', aggregateType: 'Customer', aggregateId: id });
    return { data: customer };
  }

  @Delete('customers/:id')
  @RequirePermission('catalog:manage')
  async deleteCustomer(@Param('id') id: string, @CurrentUser() user: Principal) {
    await this.catalog.deleteCustomer(id);
    await this.audit.log({ actorId: user.sub, action: 'customer.delete', aggregateType: 'Customer', aggregateId: id });
    return { data: { ok: true } };
  }

  @Get('investors')
  async investors() {
    return { data: await this.catalog.listInvestors() };
  }
}
