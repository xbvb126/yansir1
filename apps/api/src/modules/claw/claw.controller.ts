import { Body, Controller, Get, Post } from "@nestjs/common";
import { ClawService } from "./claw.service";

@Controller("api/claw")
export class ClawController {
  constructor(private readonly clawService: ClawService) {}

  @Post("chat")
  chat(@Body() body: { message?: string; prompt?: string; userId?: string }) {
    return this.clawService.chat(body.prompt || body.message || "", body.userId);
  }

  @Get("status")
  status() {
    return this.clawService.status();
  }
}
