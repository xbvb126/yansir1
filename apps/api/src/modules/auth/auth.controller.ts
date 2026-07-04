import { Body, Controller, Get, Headers, Post, Req, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { assertRateLimit, getClientIp } from "./rate-limit";
import { verifyAuthHeader } from "../users/auth-tokens";

@Controller("api/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto, @Req() request: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    assertRateLimit(`login:${getClientIp(request)}:${dto.phone}`, 8, 60_000);
    return this.authService.login(dto.phone, dto.password);
  }

  @Post("register")
  register(@Body() dto: RegisterDto, @Req() request: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    assertRateLimit(`register:${getClientIp(request)}:${dto.phone}`, 3, 10 * 60_000);
    return this.authService.register(dto.phone, dto.name, dto.password);
  }

  @Post("change-password")
  changePassword(@Body() dto: ChangePasswordDto, @Headers("authorization") authorization?: string) {
    const payload = verifyAuthHeader(authorization);
    if (!payload) {
      throw new UnauthorizedException("Invalid session");
    }

    assertRateLimit(`change-password:${payload.sub}`, 5, 10 * 60_000);
    return this.authService.changePassword(payload.sub, dto.currentPassword, dto.nextPassword);
  }

  @Get("session")
  session(@Headers("authorization") authorization?: string) {
    const payload = verifyAuthHeader(authorization);
    if (!payload) {
      throw new UnauthorizedException("Invalid session");
    }

    return { session: payload };
  }
}
