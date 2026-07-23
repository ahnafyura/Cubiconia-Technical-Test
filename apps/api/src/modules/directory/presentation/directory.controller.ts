import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { EmployeeService } from '../application/employee.service';
import { OrgUnitService } from '../application/org-unit.service';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';

const EmployeeSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  position: z.string().min(1),
  orgUnitId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
});

const OrgUnitSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  parentId: z.string().uuid().nullable().optional(),
});

@Controller('directory')
export class DirectoryController {
  constructor(
    private readonly employees: EmployeeService,
    private readonly orgUnits: OrgUnitService,
  ) {}

  // ── Karyawan ─────────────────────────────────────────────────────────────

  @Get('employees')
  @RequirePermission('employee:manage')
  async listEmployees(
    @Query('search') search?: string,
    @Query('orgUnitId') orgUnitId?: string,
    @Query('status') status?: 'active' | 'inactive',
  ) {
    return { data: await this.employees.list({ search, orgUnitId, status }) };
  }

  @Get('employees/:id')
  @RequirePermission('employee:manage')
  async getEmployee(@Param('id') id: string) {
    return { data: await this.employees.findOne(id) };
  }

  @Post('employees')
  @RequirePermission('employee:manage')
  async createEmployee(@Body() body: unknown) {
    return { data: await this.employees.create(EmployeeSchema.parse(body)) };
  }

  @Put('employees/:id')
  @RequirePermission('employee:manage')
  async updateEmployee(@Param('id') id: string, @Body() body: unknown) {
    return { data: await this.employees.update(id, EmployeeSchema.parse(body)) };
  }

  @Delete('employees/:id')
  @RequirePermission('employee:manage')
  async deactivateEmployee(@Param('id') id: string) {
    return { data: await this.employees.deactivate(id) };
  }

  @Post('employees/:id/reactivate')
  @RequirePermission('employee:manage')
  async reactivateEmployee(@Param('id') id: string) {
    return { data: await this.employees.reactivate(id) };
  }

  // ── Unit organisasi ──────────────────────────────────────────────────────

  @Get('org-units')
  @RequirePermission('employee:manage')
  async listOrgUnits() {
    return { data: await this.orgUnits.list() };
  }

  @Get('org-units/chart')
  @RequirePermission('employee:manage')
  async orgChart() {
    return { data: await this.orgUnits.orgChart() };
  }

  @Post('org-units')
  @RequirePermission('org_unit:manage')
  async createOrgUnit(@Body() body: unknown) {
    return { data: await this.orgUnits.create(OrgUnitSchema.parse(body)) };
  }

  @Put('org-units/:id/move')
  @RequirePermission('org_unit:manage')
  async moveOrgUnit(@Param('id') id: string, @Body() body: { parentId: string | null }) {
    return { data: await this.orgUnits.move(id, body.parentId) };
  }

  @Delete('org-units/:id')
  @RequirePermission('org_unit:manage')
  async deleteOrgUnit(@Param('id') id: string) {
    return { data: await this.orgUnits.softDelete(id) };
  }
}
