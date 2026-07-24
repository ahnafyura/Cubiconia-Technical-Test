import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';

export interface ProductInput {
  sku: string;
  name: string;
  category: string;
  price: string; // string → BigInt, sama seperti nominal lain di seluruh sistem
  productionCost: string;
}
export interface CustomerInput {
  name: string;
  email?: string | null;
  phone?: string | null;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts() {
    return this.prisma.product.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async createProduct(input: ProductInput) {
    const price = BigInt(input.price);
    const productionCost = BigInt(input.productionCost);
    if (price < 0n || productionCost < 0n) throw new BadRequestException('Harga dan biaya tidak boleh negatif');
    return this.prisma.product.create({
      data: { sku: input.sku, name: input.name, category: input.category, price, productionCost },
    });
  }

  async updateProduct(id: string, input: Partial<ProductInput>) {
    const existing = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Produk tidak ditemukan');
    return this.prisma.product.update({
      where: { id },
      data: {
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.price !== undefined ? { price: BigInt(input.price) } : {}),
        ...(input.productionCost !== undefined ? { productionCost: BigInt(input.productionCost) } : {}),
      },
    });
  }

  async deleteProduct(id: string) {
    const existing = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Produk tidak ditemukan');
    return this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async listCustomers() {
    return this.prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async createCustomer(input: CustomerInput) {
    return this.prisma.customer.create({
      data: { name: input.name, email: input.email ?? null, phone: input.phone ?? null },
    });
  }

  async updateCustomer(id: string, input: Partial<CustomerInput>) {
    const existing = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Pelanggan tidak ditemukan');
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      },
    });
  }

  async deleteCustomer(id: string) {
    const existing = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Pelanggan tidak ditemukan');
    return this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async listInvestors() {
    return this.prisma.investor.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
  }
}
