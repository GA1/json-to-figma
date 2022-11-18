import { ByteBuffer, compileSchema, decodeBinarySchema, parseSchema } from "kiwi-schema"
import fs from 'fs'


import * as UZIP from "uzip"

const transfer8to32 = function (fileByte: Uint8Array, start: number, cache: Uint8Array) {
  cache[0] = fileByte[start + 0]
  cache[1] = fileByte[start + 1]
  cache[2] = fileByte[start + 2]
  cache[3] = fileByte[start + 3]
}

// buffers to work with for convenience
const int32 = new Int32Array(1) // 32 bit word
const uint8 = new Uint8Array(int32.buffer) // 4 slots of 8 bits
const uint32 = new Uint32Array(int32.buffer) // 1 unsigned 32 bit word

const calcEnd = function (fileByte: Uint8Array, start: number) {
  transfer8to32(fileByte, start, uint8)
  return uint32[0]
}

export const figToJson = (fileBuffer: Buffer | ArrayBuffer): object => {
  const [schemaByte, dataByte] = figToBinaryParts(fileBuffer)

  const schemaBB = new ByteBuffer(schemaByte)
  const schema = decodeBinarySchema(schemaBB)
  const dataBB = new ByteBuffer(dataByte)
  const schemaHelper = compileSchema(schema)

  const json = schemaHelper[`decodeMessage`](dataBB)
  return convertBlobsToBase64(json)
}

function convertBlobsToBase64(json: any): object {
  if (!json.blobs) return json

  return {
    ...json,
    blobs: json.blobs.map((blob: any) => {
      return btoa(String.fromCharCode(...blob.bytes))
    })
  }
}

function convertBase64ToBlobs(json: any): object {
  if (!json.blobs) return json

  return {
    ...json,
    blobs: json.blobs.map((blob: any) => {
      return { bytes: Uint8Array.from(atob(blob), (c) => c.charCodeAt(0)) }
    })
  }
}

export const jsonToFig = async (json: any): Promise<Uint8Array> => {
  const fileBuffer = fs.readFileSync("assets/figma/schema.fig").buffer

  const [schemaByte, _] = figToBinaryParts(fileBuffer)

  const schemaBB = new ByteBuffer(schemaByte)
  const schema = decodeBinarySchema(schemaBB)
  const schemaHelper = compileSchema(schema)

  const encodedData = schemaHelper[`encodeMessage`](convertBase64ToBlobs(json))
  const encodedDataCompressed = UZIP.deflateRaw(encodedData)
  const encodedDataCompressedSize = encodedDataCompressed.length
  const encodedDataCompressedPadding = 4 - (encodedDataCompressedSize % 4)
  const encodedDataCompressedSizeWithPadding =
    encodedDataCompressedSize + encodedDataCompressedPadding

  const schemaBytesCompressed = UZIP.deflateRaw(schemaByte)
  const schemaSize = schemaBytesCompressed.length
  const schemaPadding = 4 - (schemaSize % 4)
  const schemaSizeWithPadding = schemaSize + schemaPadding

  // figma-comment length is 8
  // 4 delimiter bytes + 4 bytes for schema length + 4 bytes for data length
  const result = new Uint8Array(
    8 + 4 + (4 + schemaSizeWithPadding) + (4 + encodedDataCompressedSizeWithPadding)
  )

  // fig-kiwi comment
  result[0] = 102
  result[1] = 105
  result[2] = 103
  result[3] = 45
  result[4] = 107
  result[5] = 105
  result[6] = 119
  result[7] = 105

  // delimiter word
  result[8] = 0x0f
  result[9] = 0x00
  result[10] = 0x00
  result[11] = 0x00

  uint32[0] = schemaSizeWithPadding

  // schema length
  result[12] = uint8[0]
  result[13] = uint8[1]
  result[14] = uint8[2]
  result[15] = uint8[3]

  // transfer encoded schema to result
  result.set(schemaBytesCompressed, 16)

  // data length
  uint32[0] = encodedDataCompressedSizeWithPadding

  result[16 + schemaSizeWithPadding] = uint8[0]
  result[17 + schemaSizeWithPadding] = uint8[1]
  result[18 + schemaSizeWithPadding] = uint8[2]
  result[19 + schemaSizeWithPadding] = uint8[3]

  result.set(encodedDataCompressed, 16 + schemaSizeWithPadding + 4)

  return result
}

// note fileBuffer is mutated inside
function figToBinaryParts(fileBuffer: ArrayBuffer | Buffer): Uint8Array[] {
  let fileByte: Uint8Array = new Uint8Array(fileBuffer)

  // check bytes for figma comment "fig-kiwi" if doesn't exist, we first need to unzip the file
  if (
    fileByte[0] !== 102 ||
    fileByte[1] !== 105 ||
    fileByte[2] !== 103 ||
    fileByte[3] !== 45 ||
    fileByte[4] !== 107 ||
    fileByte[5] !== 105 ||
    fileByte[6] !== 119 ||
    fileByte[7] !== 105
  ) {
    const unzipped = UZIP.parse(fileBuffer)
    const file = unzipped["canvas.fig"]
    fileBuffer = file.buffer
    fileByte = new Uint8Array(fileBuffer)
  }

  // 8 bytes for figma comment "fig-kiwi"
  let start = 8

  // jumps 4 bytes over delimiter
  calcEnd(fileByte, start)
  start += 4

  const result = []
  while (start < fileByte.length) {
    let end = calcEnd(fileByte, start)
    start += 4

    let byteTemp = fileByte.slice(start, start + end)

    // TODO: we might not need to check for this
    // Decompress everything other than PNG bytes (they remain compressed and are handled by image-loaders)
    // WARN: it is possible this byte is not png, maybe I need to check a few more bytes?
    if (!(fileByte[start] == 137 && fileByte[start + 1] == 80)) {
      byteTemp = UZIP.inflateRaw(byteTemp)
    }

    result.push(byteTemp)
    start += end
  }

  return result
}
