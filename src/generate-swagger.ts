import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';

async function generateSwagger() {
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn'],
    });

    app.setGlobalPrefix('api/v1');

    const config = new DocumentBuilder()
      .setTitle('MeetingOS API')
      .setDescription('AI Meeting Intelligence & Organizational Knowledge Platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);

    const outputPathBackend = path.resolve(__dirname, '../swagger.json');
    const outputPathFrontend = path.resolve(__dirname, '../../frontend/src/api/swagger.json');

    fs.writeFileSync(outputPathBackend, JSON.stringify(document, null, 2), 'utf-8');
    console.log(`✅ Swagger JSON exported to ${outputPathBackend}`);

    const frontendApiDir = path.dirname(outputPathFrontend);
    if (!fs.existsSync(frontendApiDir)) {
      fs.mkdirSync(frontendApiDir, { recursive: true });
    }
    fs.writeFileSync(outputPathFrontend, JSON.stringify(document, null, 2), 'utf-8');
    console.log(`✅ Swagger JSON synchronized to frontend at ${outputPathFrontend}`);

    await app.close();
    process.exit(0);
  } catch (err) {
    console.error('Error generating Swagger document:', err);
    process.exit(1);
  }
}

generateSwagger();
