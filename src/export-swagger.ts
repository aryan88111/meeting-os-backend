import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';

async function exportSwagger() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('MeetingOS API')
    .setDescription('AI Meeting Intelligence & Organizational Knowledge Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outputPath = path.resolve(__dirname, '../../frontend/src/api/swagger.json');

  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');
  console.log(`[MeetingOS] Swagger spec exported successfully to ${outputPath}`);
  await app.close();
  process.exit(0);
}

exportSwagger().catch((err) => {
  console.error('[MeetingOS] Failed to export Swagger spec:', err);
  process.exit(1);
});
