import { Exporter, IntermediateTranslationFormat, Parser } from 'domain/formatters'
import xml2js from 'xml2js'

/*
{
  "iso": "en",
  "translations": [{
    "term": "term1",
    "translation": "Color"
  },{
    "term": "term2",
    "translation": "Size",
  }],
}
=====
<resources>
  <string name="term1">Color</string>
  <stirng name="term2">Size</string>
</resources>
*/

export const xmlParser: Parser = async (data: string) => {
  return xml2js.parseStringPromise(data).then(function (result) {
    const translations = []
    for (const one of result.resources.string) {
      const translation = one._
      const term = one.$.name

      if (!term) {
        throw new Error('XML contents are not the correct format')
      }

      translations.push({
        term,
        translation
      })
    }
    return {
      translations,
    }
  })
  .catch(function (err) {
    throw new Error(err)
  })
}

export const xmlExporter: Exporter = async (data: IntermediateTranslationFormat) => {
  const builder = new xml2js.Builder()
  return builder.buildObject({
    resources: data.translations.reduce(
      (acc, obj) => [...acc, {
        string: {
          '$': { name: obj.term },
          '_': obj.translation
        },
      }],
      []
    )
  })
}
