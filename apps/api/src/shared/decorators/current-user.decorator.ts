import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Principal } from '../guards/jwt-auth.guard';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => ctx.switchToHttp().getRequest().user,
);
