import { Controller, Get, Headers } from "@nestjs/common";
import { TeamService } from "./team.service";

@Controller("api/team")
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  getDashboard(@Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.teamService.getDashboard(authorization || userId);
  }
}
