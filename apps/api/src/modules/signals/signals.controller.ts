import { Controller, Get } from "@nestjs/common";
import { SignalsService } from "./signals.service";

@Controller("api/signals")
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  listSignals() {
    return this.signalsService.listSignals();
  }
}
