import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const requests = new Map<string, { count: number; resetAt: number }>();
  app.use((request: any, response: any, next: () => void) => {
    const key = request.ip || request.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const entry = requests.get(key);
    if (!entry || entry.resetAt <= now) {
      requests.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    entry.count += 1;
    if (entry.count > 180) {
      response.status(429).json({ message: "Too many requests" });
      return;
    }
    next();
  });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.useGlobalPipes(
    new ValidationPipe({ transform: true })
  );
  app.enableShutdownHooks();
  await app.listen(process.env.PORT || 3000);
}

void bootstrap();
