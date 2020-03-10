import { Controller, Get, Res, Options, HttpCode, HttpStatus } from '@nestjs/common'
import { resolve } from 'path'
import { config } from '../config'

@Controller()
export default class IndexController {
  @Get('*')
  async index(@Res() res) {
    res.sendFile(resolve(config.publicDir, 'index.html'))
  }

  @Options('*')
  @HttpCode(HttpStatus.OK)
  async option(@Res() res) {
  }
}
