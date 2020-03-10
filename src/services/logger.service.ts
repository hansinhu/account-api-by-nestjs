/**
 * @file logger.service.ts
 * @Synopsis s
 * @author hansin
 * @date 2019-12-02
 */
import { LoggerService } from '@nestjs/common'

export class ClubLogger implements LoggerService {
  log(message: string) {
    console.log(message)
  }

  warn(message: string) {
    console.warn(message)
  }

  error(message: string, trace: string) {
    console.error(message, trace)
  }

  debug(message: string) {
    console.debug(message)
  }

  verbose(message: string) {
    console.trace(message)
  }
}
