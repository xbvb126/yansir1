import { Body, Controller, Get, Headers, Post, Put } from "@nestjs/common";
import { AlertsService } from "./alerts.service";
import { FeishuConfigDto } from "./dto/feishu-config.dto";
import { FeishuAlertDto } from "./dto/feishu-alert.dto";

@Controller("api/alerts")
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post("feishu")
  sendFeishu(@Body() dto: FeishuAlertDto, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.alertsService.sendFeishu(dto, authorization || userId);
  }

  @Post("feishu/test")
  testFeishu(@Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.alertsService.testFeishu(authorization || userId);
  }

  @Get("feishu/config")
  getFeishuConfig(@Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.alertsService.getFeishuConfig(authorization || userId);
  }

  @Put("feishu/config")
  updateFeishuConfig(@Body() dto: FeishuConfigDto, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.alertsService.updateFeishuConfig(dto, authorization || userId);
  }

  @Get("history")
  getHistory(@Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.alertsService.getHistory(authorization || userId);
  }
}
