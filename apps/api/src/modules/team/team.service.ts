import { Injectable } from "@nestjs/common";
import { verifyAuthHeader } from "../users/auth-tokens";
import { TeamRepository } from "./team.repository";

@Injectable()
export class TeamService {
  constructor(private readonly teamRepository: TeamRepository) {}

  getDashboard(identity?: string) {
    return this.teamRepository.getDashboard(this.resolveIdentity(identity));
  }

  private resolveIdentity(identity?: string) {
    return verifyAuthHeader(identity)?.sub ?? identity ?? "";
  }
}
