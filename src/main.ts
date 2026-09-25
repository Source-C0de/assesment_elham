import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });

  // Global validation pipe: trim/transform already happens in DTO decorators;
  // this just enforces whitelist + reject unknown fields.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Uniform {"error":{"code","message"}} envelope for ALL exceptions.
  app.useGlobalFilters(new HttpExceptionFilter());

  // OpenAPI spec generation.
  const config = new DocumentBuilder()
    .setTitle('Appointment Booking API')
    .setDescription(
      [
        'Standalone recruitment exercise: book fixed appointment slots, ' +
          'list availability, and cancel bookings. No authentication.',
        '',
        'Real-time updates (slot.booked / slot.released) are emitted via Socket.IO ' +
          'on the default namespace `/` and path `/socket.io`. They are documented ' +
          'in the README, not as HTTP operations, per the task specification.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addTag('slots', 'Available appointment slots')
    .addTag('bookings', 'Create and cancel bookings')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: false },
  });

  // Persist the spec to disk so it can also be served as a static JSON file at /openapi.json.
  // (In production the in-memory `document` is exposed via a custom route below.)
  try {
    writeFileSync(join(process.cwd(), 'openapi.generated.json'), JSON.stringify(document, null, 2));
  } catch {
    /* best-effort: don't crash boot if FS is read-only */
  }

  // Serve /openapi.json from the in-memory document.
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.get('/openapi.json', (_req: any, res: any) => res.json(document));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const url = await app.getUrl();
  Logger.log(`Server listening at ${url}`, 'Bootstrap');
  Logger.log(`Swagger UI: ${url}/docs`, 'Bootstrap');
  Logger.log(`OpenAPI JSON: ${url}/openapi.json`, 'Bootstrap');
  Logger.log(`Socket.IO: ${url}/socket.io`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
