import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';

import { loadEnv } from './config/env';
import { PrismaService } from './infrastructure/database/prisma.service';
import { OutboxProcessor } from './infrastructure/outbox/outbox.processor';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';

import { AuthService } from './modules/identity/application/auth.service';
import { AuthController } from './modules/identity/presentation/auth.controller';
import { TransactionService } from './modules/sales/application/transaction.service';
import { TransactionController } from './modules/sales/presentation/transaction.controller';
import { CatalogController } from './modules/catalog/presentation/catalog.controller';
import { RuleService } from './modules/profit-sharing/application/rule.service';
import { DistributionService } from './modules/profit-sharing/application/distribution.service';
import { RuleRepository } from './modules/profit-sharing/infrastructure/rule.repository';
import { ProfitSharingController } from './modules/profit-sharing/presentation/profit-sharing.controller';
import { EmployeeService } from './modules/directory/application/employee.service';
import { OrgUnitService } from './modules/directory/application/org-unit.service';
import { DirectoryController } from './modules/directory/presentation/directory.controller';

const env = loadEnv();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    JwtModule.register({
      global: true,
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.JWT_EXPIRES_IN as never },
    }),
  ],
  controllers: [AuthController, TransactionController, CatalogController, ProfitSharingController, DirectoryController],
  providers: [
    PrismaService,
    OutboxProcessor,
    AuthService,
    TransactionService,
    RuleService,
    RuleRepository,
    DistributionService,
    EmployeeService,
    OrgUnitService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
