/**
 * Standalone OpenAPI emitter.
 *
 * Builds the same Swagger document as `main.ts` but WITHOUT opening an HTTP
 * port, and writes it to `frontend/api_schema/openapi.json`. That JSON is the
 * input for the frontend React Query codegen (`npm run generate-api`), so the
 * client can be regenerated reproducibly and offline.
 *
 * Run: `npm run openapi:json`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function generate(): Promise<void> {
  // Build the application context only — no `listen`, no background work needed.
  const app = await NestFactory.create(AppModule, { logger: false });

  // Keep this in sync with the DocumentBuilder config in `main.ts`.
  const config = new DocumentBuilder()
    .setTitle('URL Checker API')
    .setDescription('Async URL-checking service.')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outFile = resolve(__dirname, '../../frontend/api_schema/openapi.json');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(document, null, 2)}\n`);

  await app.close();

  // eslint-disable-next-line no-console
  console.log(`OpenAPI spec written to ${outFile}`);
}

generate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
