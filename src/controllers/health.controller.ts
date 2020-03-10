import { Controller, Get } from '@nestjs/common'
import { Cat } from '@/decorators'

@Controller()
export default class HealthController {
  constructor() {}

  @Get('/check-health')
  async health(@Cat() cat) {
    cat.complete()
    return { status: 'ok' }
  }
}
