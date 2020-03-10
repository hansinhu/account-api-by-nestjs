import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AuthGuard } from '@nestjs/passport'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProjectAction } from '../domain/actions'
import { IntermediateTranslation } from '../domain/formatters'
import { ImportQuery } from '../domain/http'
import { Locale } from '../entity/locale.entity'
import { ProjectLocale } from '../entity/project-locale.entity'
import { Project } from '../entity/project.entity'
import { Term } from '../entity/term.entity'
import { Translation } from '../entity/translation.entity'
import AuthorizationService from '../services/authorization.service'
import FormatService from '../services/format.service'
import { Cat } from '@/decorators'

@Controller('api/v1/projects/:projectId/imports')
export class ImportController {
  constructor(
    private auth: AuthorizationService,
    private format: FormatService,
    @InjectRepository(Translation) private translationRepo: Repository<Translation>,
    @InjectRepository(Term) private termRepo: Repository<Term>,
    @InjectRepository(ProjectLocale) private projectLocaleRepo: Repository<ProjectLocale>,
    @InjectRepository(Locale) private localeRepo: Repository<Locale>,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard())
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 512 * 1024 } })) // 500 kb max size
  async import(@Req() req, @Param('projectId') projectId: string, @Query() query: ImportQuery, @UploadedFile('file') file, @Cat() cat) {
    setTimeout(() => cat.complete(), 0)
    if (!file) {
      throw new BadRequestException('missing file to import')
    }

    const user = this.auth.getRequestUserOrClient(req)

    // Authorize user for import
    const membership = await this.auth.authorizeProjectAction(user, projectId, ProjectAction.ImportTranslation, 0, 0)

    const locale = await this.localeRepo.findOneOrFail({ where: { code: query.locale } })

    const contents = file.buffer.toString('utf-8') as string

    const incoming = await this.format.parse(query.format, contents)

    return await this.termRepo.manager.transaction(async entityManager => {
      let projectLocale: ProjectLocale | undefined = await entityManager.findOne(ProjectLocale, {
        where: { project: { id: membership.project.id }, locale: { code: locale.code } },
      })

      if (!projectLocale) {
        // Authorize if has access to project import and can add 1 locale
        await this.auth.authorizeProjectAction(user, projectId, ProjectAction.ImportTranslation, 0, 1)

        // Extract into service for creating project locales
        projectLocale = this.projectLocaleRepo.create({
          locale: locale,
          project: membership.project,
        })
        projectLocale = await entityManager.save(ProjectLocale, projectLocale)
        await entityManager.increment(Project, { id: membership.project.id }, 'localesCount', 1)
      }

      // Find existing terms and determine which terms to create
      const existingTerms = await entityManager.find(Term, {
        where: { project: { id: membership.project.id } },
      })

      // Resolve which terms / translations to add or update
      const termsToAdd = this.determineTermsToAdd(existingTerms, incoming.translations, membership.project)

      // Authorize if user would have enough terms left in plan for import
      await this.auth.authorizeProjectAction(user, projectId, ProjectAction.ImportTranslation, termsToAdd.length, 1)

      const addedTerms = await entityManager.save(Term, termsToAdd)
      const allTerms = [...addedTerms, ...existingTerms]

      const translationsToAdd = this.determineTranslationsToAdd(allTerms, incoming.translations, projectLocale)

      await entityManager.increment(Project, { id: membership.project.id }, 'termsCount', termsToAdd.length)

      await entityManager.save(Translation, translationsToAdd)

      return {
        data: {
          terms: {
            added: termsToAdd.length,
            skipped: incoming.translations.length - termsToAdd.length,
          },
          translations: {
            upserted: translationsToAdd.length,
          },
        },
      }
    })
  }

  private determineTermsToAdd(existing: Term[], incomingItems: IntermediateTranslation[], project: Project): Term[] {
    const existingTermsByValue: { [value: string]: Term } = existing.reduce((acc, term) => ({ ...acc, [term.value.toLowerCase()]: term }), {})

    const termsToAdd: Term[] = []
    const duplicateTerms: String[] = []
    const importTerms: String[] = []

    for (const incoming of incomingItems) {
      if (importTerms.includes(incoming.term.toLowerCase())) {
        duplicateTerms.push(incoming.term)
      } else {
        importTerms.push(incoming.term.toLowerCase())
      }

      const existingTerm = existingTermsByValue[incoming.term.toLowerCase()]
      if (!existingTerm) {
        // If no term exists yet, create it
        const term = this.termRepo.create({
          project: project,
          value: incoming.term,
        })
        termsToAdd.push(term)
      } else {
        if (existingTerm.value !== incoming.term) {
          duplicateTerms.push(existingTerm.value)
        }
      }
    }

    if (duplicateTerms.length) {
       throw new BadRequestException(`Duplicate terms: ${duplicateTerms.join(', ')}`)
    }

    return termsToAdd
  }

  private determineTranslationsToAdd(allTerms: Term[], incomingItems: IntermediateTranslation[], projectLocale: ProjectLocale): Translation[] {
    const termsByValue: { [value: string]: Term } = allTerms.reduce((acc, term) => ({ ...acc, [term.value]: term }), {})

    const translationsToAdd: Translation[] = []

    // Overwrite term in translation with saved one
    for (const translation of incomingItems) {
      const term = termsByValue[translation.term]
      if (!term) {
        throw new Error('missing term for translation')
      }

      translationsToAdd.push(
        this.translationRepo.create({
          termId: term.id,
          projectLocaleId: projectLocale.id,
          value: translation.translation,
        }),
      )
    }

    return translationsToAdd
  }
}
