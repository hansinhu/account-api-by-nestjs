import { Controller, Post, Body, HttpStatus, BadRequestException, Query, Res } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Response } from 'express'
import { Cat } from '@/decorators'
import { ExportProjectByClient, ExportQuery } from '../domain/http'
import { ProjectAction } from '../domain/actions'
import { IntermediateTranslationFormat } from '../domain/formatters'
import { ProjectLocale } from '../entity/project-locale.entity'
import { Term } from '../entity/term.entity'
import AuthorizationService from '../services/authorization.service'
import FormatService from '../services/format.service'

@Controller('api/v1/multi-export')
export class MultiExportController {
  constructor(
    private auth: AuthorizationService,
    private format: FormatService,
    @InjectRepository(Term) private termRepo: Repository<Term>,
    @InjectRepository(ProjectLocale)
    private projectLocaleRepo: Repository<ProjectLocale>,
  ) {}

  @Post()
  async multiExport(@Res() res: Response, @Body() payload: ExportProjectByClient[], @Query() query: ExportQuery, @Cat() cat) {
    setTimeout(() => cat.complete(), 0)
    if (!query.locale) {
      throw new BadRequestException('locale is a required param')
    }
    let data: IntermediateTranslationFormat = {
      iso: query.locale,
      translations: [],
    }

    await Promise.all(payload.map(async project => {
      const { clientId, clientSecret, projectId } = project
      const client = await this.auth.getPayloadClient({ clientId: clientId, clientSecret: clientSecret })
      const membership = await this.auth.authorizeProjectAction(client, projectId, ProjectAction.ExportTranslation)

      const projectLocale = await this.projectLocaleRepo.findOne({
        where: {
          project: membership.project,
          locale: {
            code: query.locale,
          },
        },
      })

      if (projectLocale) {
        let termData = this.termRepo
          .createQueryBuilder('term')
          .leftJoinAndSelect('term.translations', 'translation', 'translation.projectLocaleId = :projectLocaleId', {
            projectLocaleId: projectLocale.id,
          })
          .where('term.projectId = :projectId', { projectId })

        if (query.filter === '1') {
          termData = termData
            .andWhere('translation.value IS NOT NULL AND translation.value != \'\'')
        }

        const termsWithTranslations = await termData
          .orderBy('term.value', 'ASC')
          .getMany()

          data.translations.push(...termsWithTranslations.map(t => ({
            term: t.value,
            translation: t.translations.length === 1 ? t.translations[0].value : '',
          })),
        )
      }
    }))

    const serialized = await this.format.dump(query.format, data)

    res.status(HttpStatus.OK)
    res.contentType('application/octet-stream')
    res.send(serialized)
  }
}
