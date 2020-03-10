import { BadRequestException, Controller, Get, HttpStatus, NotFoundException, Param, Query, Req, Res, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { InjectRepository } from '@nestjs/typeorm'
import { Request, Response } from 'express'
import { Repository } from 'typeorm'
import { Cat } from '@/decorators'
import { ProjectAction } from '../domain/actions'
import { IntermediateTranslationFormat } from '../domain/formatters'
import { ExportQuery } from '../domain/http'
import { ProjectLocale } from '../entity/project-locale.entity'
import { Term } from '../entity/term.entity'
import AuthorizationService from '../services/authorization.service'
import FormatService from '../services/format.service'

@Controller('api/v1/projects/:projectId/exports')
export class ExportsController {
  constructor(
    private auth: AuthorizationService,
    private format: FormatService,
    @InjectRepository(Term) private termRepo: Repository<Term>,
    @InjectRepository(ProjectLocale)
    private projectLocaleRepo: Repository<ProjectLocale>,
  ) {}

  @Get()
  @UseGuards(AuthGuard())
  async export(@Req() req: Request, @Res() res: Response, @Param('projectId') projectId: string, @Query() query: ExportQuery, @Cat() cat) {
    setTimeout(() => cat.complete(), 0)
    const user = this.auth.getRequestUserOrClient(req)
    if (!query.locale) {
      throw new BadRequestException('locale is a required param')
    }

    let data: IntermediateTranslationFormat = {
      iso: query.locale,
      translations: [],
    }

    // support multi projects
    const projects = projectId.split(',')
    await Promise.all(projects.map(async projectId => {
      const membership = await this.auth.authorizeProjectAction(user, projectId, ProjectAction.ExportTranslation)

      // Ensure locale is requested project locale
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
      } else if (projects.length === 1) {
        throw new NotFoundException('unknown locale code')
      }
    }))

    const serialized = await this.format.dump(query.format, data)

    res.status(HttpStatus.OK)
    res.contentType('application/octet-stream')
    res.send(serialized)
  }
}
