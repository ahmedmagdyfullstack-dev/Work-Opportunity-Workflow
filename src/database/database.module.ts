import { Module, OnApplicationBootstrap } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Migrator } from "@mikro-orm/migrations";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { SqliteDriver } from "@mikro-orm/sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ENTITIES } from "./entities";

@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      driver:
        process.env.DATABASE_TYPE === "postgres"
          ? PostgreSqlDriver
          : SqliteDriver,
      useFactory: () => {
        const databaseType = process.env.DATABASE_TYPE ?? "sqlite";
        const common = {
          entities: ENTITIES,
          extensions: [Migrator],
          debug: false,
          allowGlobalContext: false,
          migrations: { path: "dist/database/migrations", pathTs: "src/database/migrations" }
        };

        if (databaseType === "postgres") {
          return {
            ...common,
            driver: PostgreSqlDriver,
            clientUrl: process.env.DATABASE_URL
          };
        }

        const dbName = process.env.SQLITE_PATH ?? "./data/opportunity.sqlite";
        mkdirSync(dirname(dbName), { recursive: true });
        return { ...common, driver: SqliteDriver, dbName };
      }
    }),
    MikroOrmModule.forFeature(ENTITIES)
  ],
  exports: [MikroOrmModule]
})
export class DatabaseModule implements OnApplicationBootstrap {
  constructor(private readonly orm: MikroORM) {}

  async onApplicationBootstrap(): Promise<void> {
    const databaseType = process.env.DATABASE_TYPE ?? "sqlite";
    if (databaseType === "sqlite" && process.env.NODE_ENV !== "production") {
      await this.orm.getSchemaGenerator().updateSchema();
    }
  }
}
