import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use((_: unknown, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.enableCors({
    origin: allowedOrigins(),
    credentials: false
  });
  const port = Number(process.env.API_PORT || 3101);
  await app.listen(port);
}

bootstrap();

function allowedOrigins() {
  const configured = process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (configured?.length) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? false : true;
}
