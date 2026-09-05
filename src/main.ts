import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Request, Response } from 'express';

// Global BigInt JSON serialization support
(BigInt.prototype as any).toJSON = function () {
  const int = Number.parseInt(this.toString(), 10);
  return Number.isNaN(int) ? this.toString() : int;
};

async function bootstrap() {
  const logger = new Logger('MeetingOS-API');
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS configuration
  app.enableCors({
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('MeetingOS API')
    .setDescription('AI Meeting Intelligence & Organizational Knowledge Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // Serve Swagger UI
  SwaggerModule.setup('api/docs', app, document);

  // Expose raw OpenAPI JSON endpoint for Hey API / tooling
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/docs-json', (req: Request, res: Response) => {
    res.json(document);
  });

  const port = process.env.PORT || 8000;
  await app.listen(port);
  logger.log(`MeetingOS API server is running on http://localhost:${port}/api/v1`);
  logger.log(`Swagger OpenAPI documentation: http://localhost:${port}/api/docs`);
  logger.log(`OpenAPI JSON spec: http://localhost:${port}/api/docs-json`);
}

bootstrap();
