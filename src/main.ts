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
  const allowedOriginsEnv = process.env.WEB_URL ? process.env.WEB_URL.split(',').map((o) => o.trim()) : [];
  const defaultAllowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    ...allowedOriginsEnv,
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server, Postman)
      if (!origin) return callback(null, true);

      // Check if origin is explicitly allowed or matches local dev pattern
      const isAllowed =
        defaultAllowedOrigins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

      if (isAllowed || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Origin',
      'baggage',
      'sentry-trace',
    ],
    exposedHeaders: ['Content-Disposition'],
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
