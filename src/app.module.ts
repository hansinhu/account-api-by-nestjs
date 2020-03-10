import { MiddlewareConsumer, Module, ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import { config } from './config'
import { AuthController } from './controllers/auth.controller'
import { ExportsController } from './controllers/exports.controller'
import { MultiExportController } from './controllers/multi-export.controller'
import HealthController from './controllers/health.controller'
import { ImportController } from './controllers/import.controller'
import LocaleController from './controllers/locale.controller'
import ProjectClientController from './controllers/project-client.controller'
import ProjectPlanController from './controllers/project-plan.controller'
import ProjectUserController from './controllers/project-user.controller'
import ProjectController from './controllers/project.controller'
import TermController from './controllers/term.controller'
import TranslationController from './controllers/translation.controller'
import UserController from './controllers/user.controller'
import { Locale } from './entity/locale.entity'
import { Plan } from './entity/plan.entity'
import { ProjectClient } from './entity/project-client.entity'
import { ProjectLocale } from './entity/project-locale.entity'
import { ProjectUser } from './entity/project-user.entity'
import { Project } from './entity/project.entity'
import { Term } from './entity/term.entity'
import { Translation } from './entity/translation.entity'
import { User } from './entity/user.entity'
import { CustomExceptionFilter } from './filters/exception.filter'
import AuthorizationService from './services/authorization.service'
import { JwtStrategy } from './services/jwt.strategy'
import MailService from './services/mail.service'
import { UserService } from './services/user.service'
import FormatService from './services/format.service'
import IndexController from './controllers/index.controller'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secretOrPrivateKey: config.secret,
      signOptions: {
        expiresIn: config.authTokenExpires,
      },
    }),
    TypeOrmModule.forRoot(config.db.default),
    TypeOrmModule.forFeature([User, ProjectUser, Project, Term, Locale, ProjectLocale, Translation, ProjectClient, Plan]),
  ],
  controllers: [
    HealthController,
    AuthController,
    UserController,
    ProjectController,
    ProjectPlanController,
    ProjectUserController,
    TermController,
    TranslationController,
    ImportController,
    ProjectClientController,
    ExportsController,
    MultiExportController,
    LocaleController,
    IndexController,
  ],
  providers: [
    UserService,
    MailService,
    JwtStrategy,
    AuthorizationService,
    FormatService,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // configure
  }
}

export const addPipesAndFilters = (app: NestExpressApplication) => {
  app.disable('x-powered-by')
  app.set('etag', false)

  if (config.corsEnabled) {
    app.enableCors({ origin: '*' })
  }

  app.useGlobalFilters(new CustomExceptionFilter())

  app.useGlobalPipes(
    new ValidationPipe({
      transform: false,
      disableErrorMessages: true,
      whitelist: true,
    }),
  )
}
