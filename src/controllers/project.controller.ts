import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { InjectRepository } from '@nestjs/typeorm'
import _ from 'lodash'
import { Repository } from 'typeorm'
import { config } from '../config'
import { ProjectAction } from '../domain/actions'
import { CreateProjectRequest, UpdateProjectRequest } from '../domain/http'
import { Plan } from '../entity/plan.entity'
import { ProjectRole, ProjectUser } from '../entity/project-user.entity'
import { Project } from '../entity/project.entity'
import { User } from '../entity/user.entity'
import { ProjectLocale } from '../entity/project-locale.entity'
import { Translation } from '../entity/translation.entity'
import { TooManyRequestsException } from '../errors'
import AuthorizationService from '../services/authorization.service'

@Controller('api/v1/projects')
@UseGuards(AuthGuard())
export default class ProjectController {
  constructor(
    private auth: AuthorizationService,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(ProjectUser) private projectUserRepo: Repository<ProjectUser>,
    @InjectRepository(ProjectLocale) private projectLocaleRepo: Repository<ProjectLocale>,
    @InjectRepository(Translation) private translationRepo: Repository<Translation>,
  ) {}

  @Get()
  async find(@Req() req) {
    const user = this.auth.getRequestUserOrClient(req, { mustBeUser: true })
    const memberships = await this.projectUserRepo.find({
      where: { user: { id: user.id } },
      relations: ['project'],
    })

    let data = memberships.map(p => ({
      project: p.project,
      role: p.role,
      locales: [],
    }))

    await Promise.all(data.map(async membership => {
      const projectLocales = await this.projectLocaleRepo.find({
        where: {
          project: membership.project,
        },
        relations: ['locale'],
      })
      await Promise.all(projectLocales.map(async (projectLocale, index) => {
        const translations = await this.translationRepo.find({
          where: {
            projectLocaleId: projectLocale.id
          },
          relations: ['term'],
        })
        const translatedCount = translations.filter(tr => tr.value !== '').length
        _.set(membership.locales, index, {
          ..._.omit(projectLocale.locale, 'date'),
          translatedCount: translatedCount,
        })
      }))
    }))

    return {
      data: data.map(p => ({
        ...p.project,
        role: p.role,
        locales: p.locales,
      })),
    }
  }

  @Post()
  async create(@Req() req, @Body() payload: CreateProjectRequest) {
    const user = this.auth.getRequestUserOrClient(req, { mustBeUser: true })

    if (user.numProjectsCreated >= config.maxProjectsPerUser) {
      throw new TooManyRequestsException('Too many projects for a single user, please contact support to request a limit increase')
    }

    const result = await this.projectRepo.manager.transaction(async tx => {
      let project = this.projectRepo.create(payload)
      project = await tx.save(project)

      // Create project user as admin
      const membership = this.projectUserRepo.create({ user, project, role: ProjectRole.Admin })
      await tx.save(membership)

      // Create default project plan
      const defaultPlan = await tx.findOneOrFail(Plan, { where: { code: config.defaultProjectPlan } })
      project.plan = defaultPlan

      await tx.save(project)
      user.numProjectsCreated += 1
      await tx.update(User, { id: user.id }, { numProjectsCreated: user.numProjectsCreated })

      return membership
    })

    return { data: { ..._.omit(result.project, ['plan']), role: result.role } }
  }

  @Get(':projectId')
  async findOne(@Req() req, @Param('projectId') projectId: string) {
    const user = this.auth.getRequestUserOrClient(req, { mustBeUser: true })
    const membership = await this.auth.authorizeProjectAction(user, projectId, ProjectAction.ViewProject)
    return {
      data: {
        ..._.omit(membership.project, 'plan'),
        role: membership.role,
      },
    }
  }

  @Patch(':projectId')
  async update(@Req() req, @Param('projectId') projectId: string, @Body() payload: UpdateProjectRequest) {
    const user = this.auth.getRequestUserOrClient(req, { mustBeUser: true })

    const membership = await this.auth.authorizeProjectAction(user, projectId, ProjectAction.EditProject)

    await this.projectRepo.update(projectId, payload)
    const project = await this.projectRepo.findOneOrFail(projectId)

    return { data: { ...project, role: membership.role } }
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req, @Param('projectId') projectId: string) {
    const user = this.auth.getRequestUserOrClient(req, { mustBeUser: true })
    await this.auth.authorizeProjectAction(user, projectId, ProjectAction.DeleteProject)

    await this.projectRepo.manager.transaction(async tx => {
      await tx.delete(Project, { id: projectId })

      user.numProjectsCreated -= 1
      if (user.numProjectsCreated < 0) {
        user.numProjectsCreated = 0
      }

      await tx.update(User, { id: user.id }, { numProjectsCreated: user.numProjectsCreated })
    })
  }
}
