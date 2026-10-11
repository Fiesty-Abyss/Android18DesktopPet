import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { join } from 'node:path'
import { isPng, readPngCharacterCard, writePngCharacterCard } from '../electron/png-card'

const root = join(__dirname, '..')
const petPng = readFileSync(join(root, 'assets', 'tray-icon.png'))
const veraPng = readFileSync(
  join(root, 'character-cards', 'main_vera-volkova-tokyo-mafia-1b9ca50d2c0f_spec_v2.png')
)

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])), 8 + data.length)
  return out
}

/** 在 IEND 之前插入一个自定义块 */
function insertBeforeIend(png: Buffer, extra: Buffer): Buffer {
  const iend = png.length - 12
  return Buffer.concat([png.subarray(0, iend), extra, png.subarray(iend)])
}

describe('png-card', () => {
  it('识别 PNG 签名', () => {
    expect(isPng(petPng)).toBe(true)
    expect(isPng(Buffer.from('{"a":1}'))).toBe(false)
  })

  it('没有内嵌卡时返回 null', () => {
    expect(readPngCharacterCard(petPng)).toBeNull()
  })

  it('读取 SillyTavern V2 卡（tEXt chara），有重复块时取第一个', () => {
    const result = readPngCharacterCard(veraPng)
    expect(result?.spec).toBe('v2')
    expect((result?.card as { data: { name: string } }).data.name).toBe('Vera Volkova - Tokyo Mafia')
  })

  it('写入后可以读回，并优先使用 V3（ccv3）', () => {
    const v2 = { spec: 'chara_card_v2', data: { name: 'V2 名字' } }
    const v3 = { spec: 'chara_card_v3', data: { name: 'V3 名字' } }
    const written = writePngCharacterCard(petPng, v2, v3)
    const result = readPngCharacterCard(written)
    expect(result?.spec).toBe('v3')
    expect(result?.card).toEqual(v3)
  })

  it('重复写入会替换旧的角色卡块而不是叠加', () => {
    const once = writePngCharacterCard(petPng, { n: 1 }, { n: 1 })
    const twice = writePngCharacterCard(once, { n: 2 }, { n: 2 })
    expect(readPngCharacterCard(twice)?.card).toEqual({ n: 2 })
    expect(twice.length).toBe(once.length)
  })

  it('支持 iTXt（zlib 压缩）与 zTXt', () => {
    const json = JSON.stringify({ data: { name: '压缩卡' } })
    const base64 = Buffer.from(json, 'utf8').toString('base64')
    const itxt = Buffer.concat([
      Buffer.from('chara\0', 'latin1'),
      Buffer.from([1, 0]),
      Buffer.from('\0\0', 'latin1'),
      deflateSync(Buffer.from(base64, 'utf8'))
    ])
    const fromItxt = readPngCharacterCard(insertBeforeIend(petPng, chunk('iTXt', itxt)))
    expect((fromItxt?.card as { data: { name: string } }).data.name).toBe('压缩卡')

    const ztxt = Buffer.concat([Buffer.from('chara\0', 'latin1'), Buffer.from([0]), deflateSync(Buffer.from(base64))])
    const fromZtxt = readPngCharacterCard(insertBeforeIend(petPng, chunk('zTXt', ztxt)))
    expect((fromZtxt?.card as { data: { name: string } }).data.name).toBe('压缩卡')
  })
})
