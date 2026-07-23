import { SetMetadata } from '@nestjs/common';
export const REQUIRED_PERMISSION = 'requiredPermission';
export const RequirePermission = (permission: string) => SetMetadata(REQUIRED_PERMISSION, permission);
