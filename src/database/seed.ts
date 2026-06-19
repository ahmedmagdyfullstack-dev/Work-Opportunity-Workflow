import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { CvProfileService } from "../ai/cv-profile.service";

async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.get(CvProfileService).ensureDefaults();
  await app.close();
}

void seed();
