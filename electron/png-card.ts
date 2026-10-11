/**
 * 读写 SillyTavern / Chub 风格的 PNG 角色卡。
 *
 * 角色卡 JSON 以 base64 形式存放在 PNG 的文本块里：
 * - V2：关键字 `chara`（chara_card_v2）
 * - V3：关键字 `ccv3`（chara_card_v3），存在时优先使用
 * 支持 tEXt、iTXt（未压缩 / zlib 压缩）和 zTXt 三种文本块。
 */
import { inflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CARD_KEYWORDS = ['ccv3', 'chara'] as const

type TextChunk = { keyword: string; text: string }

export function isPng(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)
}

function readTextChunks(buffer: Buffer): TextChunk[] {
  const chunks: TextChunk[] = []
  let offset = 8
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > buffer.length) break
    const data = buffer.subarray(dataStart, dataEnd)

    try {
      if (type === 'tEXt') {
        const separator = data.indexOf(0)
        if (separator > 0) {
          chunks.push({
            keyword: data.toString('latin1', 0, separator),
            text: data.toString('latin1', separator + 1)
          })
        }
      } else if (type === 'zTXt') {
        const separator = data.indexOf(0)
        if (separator > 0) {
          // separator 后一字节是压缩方法（只有 0 = zlib）
          chunks.push({
            keyword: data.toString('latin1', 0, separator),
            text: inflateSync(data.subarray(separator + 2)).toString('latin1')
          })
        }
      } else if (type === 'iTXt') {
        // keyword\0 compressionFlag compressionMethod languageTag\0 translatedKeyword\0 text
        const keywordEnd = data.indexOf(0)
        if (keywordEnd > 0) {
          const compressed = data[keywordEnd + 1] === 1
          const languageEnd = data.indexOf(0, keywordEnd + 3)
          const translatedEnd = languageEnd >= 0 ? data.indexOf(0, languageEnd + 1) : -1
          if (translatedEnd >= 0) {
            const raw = data.subarray(translatedEnd + 1)
            chunks.push({
              keyword: data.toString('latin1', 0, keywordEnd),
              text: (compressed ? inflateSync(raw) : raw).toString('utf8')
            })
          }
        }
      }
    } catch {
      // 单个损坏的文本块不影响其它块
    }

    if (type === 'IEND') break
    offset = dataEnd + 4
  }
  return chunks
}

function decodeCardText(text: string): unknown {
  const trimmed = text.trim()
  // 规范要求 base64，但也兼容直接存 JSON 的卡
  const json = trimmed.startsWith('{') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8')
  return JSON.parse(json)
}

/** 从 PNG 中读取内嵌角色卡；没有或解析失败时返回 null */
export function readPngCharacterCard(buffer: Buffer): { spec: 'v3' | 'v2'; card: unknown } | null {
  if (!isPng(buffer)) return null
  const chunks = readTextChunks(buffer)
  for (const keyword of CARD_KEYWORDS) {
    // 有些卡里会残留多个同名块，与 SillyTavern 一致取第一个能解析的
    for (const chunk of chunks.filter((item) => item.keyword.toLowerCase() === keyword)) {
      try {
        return { spec: keyword === 'ccv3' ? 'v3' : 'v2', card: decodeCardText(chunk.text) }
      } catch {
        continue
      }
    }
  }
  return null
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function makeTextChunk(keyword: string, text: string): Buffer {
  const data = Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')])
  const typeAndData = Buffer.concat([Buffer.from('tEXt', 'latin1'), data])
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  typeAndData.copy(chunk, 4)
  chunk.writeUInt32BE(crc32(typeAndData), 8 + data.length)
  return chunk
}

/**
 * 把角色卡写进 PNG：移除原有的 chara / ccv3 文本块，在 IEND 前写入新的 V2（chara）与 V3（ccv3）块。
 */
export function writePngCharacterCard(png: Buffer, cardV2: unknown, cardV3: unknown): Buffer {
  if (!isPng(png)) throw new Error('不是有效的 PNG 图片')
  const parts: Buffer[] = [PNG_SIGNATURE]
  let offset = 8
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('latin1', offset + 4, offset + 8)
    const end = offset + 12 + length
    const chunk = png.subarray(offset, end)

    if (type === 'IEND') {
      parts.push(makeTextChunk('chara', Buffer.from(JSON.stringify(cardV2), 'utf8').toString('base64')))
      parts.push(makeTextChunk('ccv3', Buffer.from(JSON.stringify(cardV3), 'utf8').toString('base64')))
      parts.push(chunk)
      break
    }

    let isCardChunk = false
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const data = png.subarray(offset + 8, offset + 8 + length)
      const keyword = data.toString('latin1', 0, Math.max(0, data.indexOf(0))).toLowerCase()
      isCardChunk = (CARD_KEYWORDS as readonly string[]).includes(keyword)
    }
    if (!isCardChunk) parts.push(chunk)
    offset = end
  }
  return Buffer.concat(parts)
}
