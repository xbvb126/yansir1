import { Body, Controller, ForbiddenException, Get, Headers, Param, Patch } from "@nestjs/common";
import { verifyAuthHeader } from "./auth-tokens";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

@Controller("api")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  getMe(@Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.usersService.getCurrentUser(authorization || userId);
  }

  @Get("me/entitlements")
  getEntitlements(@Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.usersService.getCurrentEntitlements(authorization || userId);
  }

  @Get("admin/users")
  getUsers(@Headers("authorization") authorization?: string) {
    assertAdmin(authorization);
    return this.usersService.listUsers();
  }

  @Patch("admin/users/:userId")
  updateUser(@Param("userId") userId: string, @Body() dto: UpdateUserDto, @Headers("authorization") authorization?: string) {
    assertAdmin(authorization);

    return this.usersService.updateUser(userId, dto);
  }
}

function assertAdmin(authorization?: string) {
  const session = verifyAuthHeader(authorization);
  if (!session || session.role !== "admin") {
    throw new ForbiddenException("Admin role required");
  }
}
