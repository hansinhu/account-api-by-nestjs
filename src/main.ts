const cleanup = require('tsconfig-paths').register({
  baseUrl: require('../tsconfig.json').compilerOptions.baseUrl,
  paths: require('../tsconfig.json').compilerOptions.paths,
})

import { Connection } from 'typeorm'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { ClubLogger } from 'services/logger.service'

import { addPipesAndFilters, AppModule } from './app.module'
import { config } from './config'

interface Closable {
  close(): Promise<void>
}

const closables: Closable[] = []

process.on('SIGINT', async () => {
  console.log('Shutting down...')
  for (const closable of closables) {
    await closable.close()
  }
  process.exit(1)
})

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ClubLogger(),
    cors: true,
  })
  addPipesAndFilters(app)
  closables.push(app)

  // Run migrations
  if (config.autoMigrate) {
    console.log('Running DB migrations if necessary')
    const connection = app.get(Connection)
    await connection.runMigrations()
    console.log('DB migrations up to date')
  }

  await app.listen(config.port, '0.0.0.0', () => {
    console.log(`listen on port: ${config.port}`)
  })
}

bootstrap()
cleanup()
