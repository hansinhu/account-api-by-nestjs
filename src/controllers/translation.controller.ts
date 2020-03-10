import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Req, UseGuards, Query } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { InjectRepository } from '@nestjs/typeorm'
import _ from 'lodash'
import { Repository, In, Like } from 'typeorm'
import { ProjectAction } from '../domain/actions'
import { AddLocaleRequest, UpdateTranslationRequest, TransRequest, MultiTransRequest, TranslationsQuery } from '../domain/http'
import { Locale } from '../entity/locale.entity'
import { ProjectLocale } from '../entity/project-locale.entity'
import { Project } from '../entity/project.entity'
import { Term } from '../entity/term.entity'
import { Translation } from '../entity/translation.entity'
import AuthorizationService from '../services/authorization.service'

@Controller('api/v1/projects/:projectId')
@UseGuards(AuthGuard())
export default class TranslationController {
  constructor(
    private auth: AuthorizationService,
    @InjectRepository(Translation) private translationRepo: Repository<Translation>,
    @InjectRepository(ProjectLocale) private projectLocaleRepo: Repository<ProjectLocale>,
    @InjectRepository(Term) private termRepo: Repository<Term>,
    @InjectRepository(Locale) private localeRepo: Repository<Locale>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
  ) {}

  // 获取项目翻译locales
  @Get('translations')
  async find(@Req() req, @Param('projectId') projectId: string) {
    const user = this.auth.getRequestUserOrClient(req)
    const membership = await this.auth.authorizeProjectAction(user, projectId, ProjectAction.ViewTranslation)
    const locales = await this.projectLocaleRepo.find({
      where: {
        project: membership.project,
      },
      relations: ['locale'],
    })

    if (!locales || locales.length === 0) {
      return { data: [] }
    }

    return {
      data: locales.map(loc => _.pick(loc, ['id', 'date', 'locale.code', 'locale.region', 'locale.language'])),
    }
  }

  // 创建项目翻译语种
  @Post('translations')
  async create(@Req() req, @Param('projectId') projectId: string, @Body() payload: AddLocaleRequest) {
    const user = this.auth.getRequestUserOrClient(req)
    const membership = await this.auth.authorizeProjectAction(user, projectId, ProjectAction.AddTranslation, 0, 1)

    const locale = await this.localeRepo.findOne({ code: payload.code })

    if (!locale) {
      throw new NotFoundException('unknown locale code')
    }

    const projectLocale = this.projectLocaleRepo.create({
      locale: locale,
      project: membership.project,
    })

    await this.termRepo.manager.transaction(async entityManager => {
      await entityManager.save(projectLocale)
      await entityManager.increment(Project, { id: membership.project.id }, 'localesCount', 1)
    })

    const result = await this.projectLocaleRepo.findOneOrFail({
      locale,
      project: membership.project,
    })

    return {
      data: {
        id: result.id,
        locale: {
          code: projectLocale.locale.code,
          region: projectLocale.locale.region,
          language: projectLocale.locale.language,
        },
        date: result.date,
      },
    }
  }

  // 获取项目语种翻译
  @Get('translations/:localeCode')
  async findOne(
    @Req() req,
    @Param('projectId') projectId: string,
    @Param('localeCode') localeCode: string,
    @Query() query: TranslationsQuery,
  ) {
    const user = this.auth.getRequestUserOrClient(req)
    const membership = await this.auth.authorizeProjectAction(user, projectId, ProjectAction.ViewTranslation)

    // Ensure locale is requested project locale
    const projectLocale = await this.projectLocaleRepo.findOneOrFail({
      where: {
        project: membership.project,
        locale: {
          code: localeCode,
        },
      },
    })

    const translations = await this.translationRepo.find({
      where: {
        projectLocale,
      },
      relations: ['term'],
      skip: query?.offset,
      take: query?.limit,
    })

    const result = translations.map(t => ({ termId: t.term.id, value: t.value }))

    return { data: result }
  }

  // 创建一条翻译
  @Patch('translations/:localeCode')
  async update(
    @Req() req,
    @Param('projectId') projectId: string,
    @Param('localeCode') localeCode: string,
    @Body() payload: UpdateTranslationRequest,
  ) {
    const user = this.auth.getRequestUserOrClient(req)
    await this.auth.authorizeProjectAction(user, projectId, ProjectAction.EditTranslation)

    const projectLocale = await this.projectLocaleRepo.findOneOrFail({
      where: {
        locale: {
          code: localeCode,
        },
        project: {
          id: projectId,
        },
      },
    })

    const term = await this.termRepo
      .createQueryBuilder('term')
      .leftJoinAndSelect('term.translations', 'translation', 'translation.projectLocaleId = :projectLocaleId', { projectLocaleId: projectLocale.id })
      .where('term.projectId = :projectId', { projectId })
      .andWhere('term.id = :termId', { termId: payload.termId })
      .getOne()

    if (!term) {
      throw new NotFoundException('term not found')
    }

    const translation = this.translationRepo.create({
      value: payload.value,
      projectLocale,
      term,
    })

    await this.translationRepo.save(translation)

    return {
      data: {
        value: translation.value,
        termId: term.id,
        date: translation.date,
      },
    }
  }

  // 删除语种翻译
  @Delete('translations/:localeCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req, @Param('projectId') projectId: string, @Param('localeCode') localeCode: string) {
    const user = this.auth.getRequestUserOrClient(req)
    const membership = await this.auth.authorizeProjectAction(user, projectId, ProjectAction.DeleteTranslation)

    await this.projectLocaleRepo.manager.transaction(async entityManager => {
      const projectLocale = await entityManager.findOneOrFail(ProjectLocale, {
        where: {
          project: membership.project,
          locale: {
            code: localeCode,
          },
        },
      })
      await entityManager.remove(projectLocale)
      await entityManager.decrement(Project, { id: membership.project.id }, 'localesCount', 1)
    })
  }

  @Post('translate')
  async translate(
    @Req() req,
    @Param('projectId') projectId: string,
    @Body() payload: TransRequest,
  ) {
    const user = this.auth.getRequestUserOrClient(req)
    const membership = await this.auth.authorizeProjectAction(user, projectId, ProjectAction.ViewTranslation)

    const projectLocale = await this.projectLocaleRepo.findOneOrFail({
      where: {
        project: membership.project,
        localeCode: Like(`${payload.locale.substring(0, 2)}%`),
      },
    })

    const term = await this.termRepo.findOneOrFail({
      where: {
        project: membership.project,
        value: payload.key,
      }
    })

    const translation = await this.translationRepo.findOneOrFail({
      where: {
        projectLocale,
        term,
      },
      relations: ['term'],
    })

    console.log('获取翻译:', translation)

    return {
      body: {
        value: translation.value,
      },
      code: 0,
    }
  }

  @Post('multi-translate')
  async multiTranslate(
    @Req() req,
    @Param('projectId') projectId: string,
    @Body() payload: MultiTransRequest,
  ) {
    const user = this.auth.getRequestUserOrClient(req)
    const membership = await this.auth.authorizeProjectAction(user, projectId, ProjectAction.ViewTranslation)
    const projectLocale = await this.projectLocaleRepo.findOneOrFail({
      where: {
        project: membership.project,
        localeCode: Like(`${payload.locale.substring(0, 2)}%`),
      },
    })

    const terms = await this.termRepo.find({
      select: ["id"],
      where: {
        project: membership.project,
        value: In(payload.keys)
      },
    })

    const translations = await this.translationRepo.find({
      where: {
        projectLocale,
        termId: In(terms.map(term => term.id))
      },
      relations: ['term']
    })

    console.log('获取翻译:', translations)

    const translationMap = _.keyBy(translations, (o) => {
      return o.term.value.toLowerCase()
    })

    const values = []
    payload.keys.map(key => {
      if (key) {
        values.push(_.get(_.get(translationMap, key.toString().toLowerCase()), 'value'))
      } else {
        values.push(null)
      }
    })

    return {
      body: {
        values: values,
      },
      code: 0,
    }
  }

  @Get('dict')
  async dict(
    @Req() req,
    @Param('projectId') projectId: string,
  ) {
    const user = this.auth.getRequestUserOrClient(req)
    const membership = await this.auth.authorizeProjectAction(user, projectId, ProjectAction.ViewTranslation)
    // project_locale
    const locales = await this.projectLocaleRepo.find({
      where: {
        project: membership.project,
      },
      relations: ['locale'],
    })

    const translations = await this.translationRepo.find({
      where: {
        projectLocaleId: In(locales.map(locale => locale.id)),
      },
      relations: ['term', 'projectLocale'],
    })

    return translations.map(trans => _.pick(trans, ['value', 'projectLocale.localeCode', 'term.value']))
  }
}
