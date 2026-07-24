import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { EmployeeService } from '../application/employee.service';
import { OrgUnitService } from '../application/org-unit.service';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { AuditService } from '@shared/audit/audit.service';
import type { Principal } from '@shared/guards/jwt-auth.guard';

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
    private readonly audit: AuditService,
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
  async createEmployee(@Body() body: unknown, @CurrentUser() user: Principal) {
    const employee = await this.employees.create(EmployeeSchema.parse(body));
    await this.audit.log({ actorId: user.sub, action: 'employee.create', aggregateType: 'Employee', aggregateId: employee.id });
    return { data: employee };
  }

  @Put('employees/:id')
  @RequirePermission('employee:manage')
  async updateEmployee(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: Principal) {
    const employee = await this.employees.update(id, EmployeeSchema.parse(body));
    await this.audit.log({ actorId: user.sub, action: 'employee.update', aggregateType: 'Employee', aggregateId: id });
    return { data: employee };
  }

  @Delete('employees/:id')
  @RequirePermission('employee:manage')
  async deactivateEmployee(@Param('id') id: string, @CurrentUser() user: Principal) {
    const employee = await this.employees.deactivate(id);
    await this.audit.log({ actorId: user.sub, action: 'employee.deactivate', aggregateType: 'Employee', aggregateId: id });
    return { data: employee };
  }

  @Post('employees/:id/reactivate')
  @RequirePermission('employee:manage')
  async reactivateEmployee(@Param('id') id: string, @CurrentUser() user: Principal) {
    const employee = await this.employees.reactivate(id);
    await this.audit.log({ actorId: user.sub, action: 'employee.reactivate', aggregateType: 'Employee', aggregateId: id });
    return { data: employee };
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
  async createOrgUnit(@Body() body: unknown, @CurrentUser() user: Principal) {
    const unit = await this.orgUnits.create(OrgUnitSchema.parse(body));
    await this.audit.log({ actorId: user.sub, action: 'org_unit.create', aggregateType: 'OrgUnit', aggregateId: unit.id });
    return { data: unit };
  }

  @Put('org-units/:id/move')
  @RequirePermission('org_unit:manage')
  async moveOrgUnit(@Param('id') id: string, @Body() body: { parentId: string | null }, @CurrentUser() user: Principal) {
    const unit = await this.orgUnits.move(id, body.parentId);
    await this.audit.log({
      actorId: user.sub,
      action: 'org_unit.move',
      aggregateType: 'OrgUnit',
      aggregateId: id,
      metadata: { newParentId: body.parentId },
    });
    return { data: unit };
  }

  @Delete('org-units/:id')
  @RequirePermission('org_unit:manage')
  async deleteOrgUnit(@Param('id') id: string, @CurrentUser() user: Principal) {
    const unit = await this.orgUnits.softDelete(id);
    await this.audit.log({ actorId: user.sub, action: 'org_unit.delete', aggregateType: 'OrgUnit', aggregateId: id });
    return { data: unit };
  }
}
