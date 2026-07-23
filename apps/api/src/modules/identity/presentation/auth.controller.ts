import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from '../application/auth.service';
import { Public } from '@shared/decorators/public.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import type { Principal } from '@shared/guards/jwt-auth.guard';

const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: unknown) {
    const { email, password } = LoginSchema.parse(body);
    return { data: await this.auth.login(email, password) };
  }

  @Get('me')
  me(@CurrentUser() user: Principal) {
    return { data: user };
  }
}
