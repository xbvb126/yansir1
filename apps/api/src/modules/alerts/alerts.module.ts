import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";

@Module({
  imports: [UsersModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService]
})
export class AlertsModule {}
