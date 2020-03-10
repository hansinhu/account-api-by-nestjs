import { Injectable, BadRequestException } from '@nestjs/common'
import { ImportExportFormat } from '../domain/http'
import { IntermediateTranslationFormat } from '../domain/formatters'
import { csvParser } from '../formatters/csv'
import { jsonFlatParser } from '../formatters/jsonflat'
import { jsonNestedParser } from '../formatters/jsonnested'
import { propertiesParser } from '../formatters/properties'
import { xliffParser } from '../formatters/xliff'
import { yamlFlatParser } from '../formatters/yaml-flat'
import { yamlNestedParser } from '../formatters/yaml-nested'
import { gettextParser } from '../formatters/gettext'
import { stringsParser } from '../formatters/strings'
import { xmlParser } from '../formatters/xml'
import { csvExporter } from '../formatters/csv'
import { jsonFlatExporter } from '../formatters/jsonflat'
import { jsonNestedExporter } from '../formatters/jsonnested'
import { propertiesExporter } from '../formatters/properties'
import { xliffExporter } from '../formatters/xliff'
import { yamlFlatExporter } from '../formatters/yaml-flat'
import { yamlNestedExporter } from '../formatters/yaml-nested'
import { gettextExporter } from '../formatters/gettext'
import { stringsExporter } from '../formatters/strings'
import { xmlExporter } from '../formatters/xml'

@Injectable()
export default class FormatService {
  async parse(format: ImportExportFormat, contents): Promise<IntermediateTranslationFormat> {
    try {
      switch (format) {
        case 'csv':
          return await csvParser(contents)
        case 'xliff12':
          return await xliffParser({ version: '1.2' })(contents)
        case 'jsonflat':
          return await jsonFlatParser(contents)
        case 'jsonnested':
          return await jsonNestedParser(contents)
        case 'yamlflat':
          return await yamlFlatParser(contents)
        case 'yamlnested':
          return await yamlNestedParser(contents)
        case 'properties':
          return await propertiesParser(contents)
        case 'po':
          return await gettextParser(contents)
        case 'strings':
          return await stringsParser(contents)
        case 'xml':
          return await xmlParser(contents)
        default:
          throw new Error('Import format not implemented')
      }
    } catch (err) {
      throw new BadRequestException(err)
    }
  }

  async dump(format: ImportExportFormat, data: IntermediateTranslationFormat): Promise<string | Buffer> {
    switch (format) {
      case 'csv':
        return await csvExporter(data)
      case 'xliff12':
        return await xliffExporter({ version: '1.2' })(data)
      case 'jsonflat':
        return await jsonFlatExporter(data)
      case 'jsonnested':
        return await jsonNestedExporter(data)
      case 'yamlflat':
        return await yamlFlatExporter(data)
      case 'yamlnested':
        return await yamlNestedExporter(data)
      case 'properties':
        return await propertiesExporter(data)
      case 'po':
        return await gettextExporter(data)
      case 'strings':
        return await stringsExporter(data)
      case 'xml':
        return await xmlExporter(data)
      default:
        throw new Error('Export format not implemented')
    }
  }
}
