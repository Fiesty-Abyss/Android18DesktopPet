import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  findCommand,
  findGreeting,
  isPluginEnabled,
  loadPlugins,
  parseManifest,
  PluginScheduler,
  pluginSystemPrompt,
  renderTemplate,
  type LoadedPlugin
} from '../electron/plugins'

const pluginsDir = join(__dirname, '..', 'plugins')
const context = { characterName: '人造人18号', affinity: 5 }

function plugin(manifest: Record<string, unknown>): LoadedPlugin {
  return { dir: '/tmp', manifest: parseManifest({ manifestVersion: 1, name: '测试', version: '1.0.0', ...manifest }) }
}

describe('parseManifest', () => {
  it('示例插件都能通过校验', () => {
    for (const id of ['daily-greetings', 'health-reminders']) {
      const raw = JSON.parse(readFileSync(join(pluginsDir, id, 'plugin.json'), 'utf8'))
      expect(parseManifest(raw).id).toBe(id)
    }
  })

  it('拒绝不合法的清单并给出原因', () => {
    expect(() => parseManifest({ id: 'x', name: 'x', version: '1' })).toThrow('manifestVersion')
    expect(() => parseManifest({ manifestVersion: 1, id: 'Bad Id', name: 'x', version: '1' })).toThrow('id')
    expect(() =>
      parseManifest({ manifestVersion: 1, id: 'x', name: 'x', version: '1', reminders: [{ every: 0, text: 'a' }] })
    ).toThrow('every')
    expect(() =>
      parseManifest({ manifestVersion: 1, id: 'x', name: 'x', version: '1', reminders: [{ at: '25:00', text: 'a' }] })
    ).toThrow('at')
  })

  it('截断超长文本', () => {
    const manifest = parseManifest({
      manifestVersion: 1,
      id: 'x',
      name: 'x',
      version: '1',
      commands: [{ trigger: '/a', reply: 'a'.repeat(2000) }]
    })
    expect((manifest.commands?.[0].reply as string[])[0]).toHaveLength(500)
  })
})

describe('loadPlugins', () => {
  it('加载仓库附带的示例插件', async () => {
    const { plugins, errors } = await loadPlugins(pluginsDir)
    expect(errors).toEqual([])
    expect(plugins.map((item) => item.manifest.id).sort()).toEqual(['daily-greetings', 'health-reminders'])
  })
})

describe('模板与匹配', () => {
  const now = new Date(2026, 9, 11, 23, 5)

  it('渲染模板变量', () => {
    expect(renderTemplate('{date} {weekday} {time} {name} {affinity} {unknown}', { ...context, now })).toBe(
      '2026-10-11 星期日 23:05 人造人18号 5 {unknown}'
    )
  })

  it('问候支持跨午夜的时段', () => {
    const p = plugin({ id: 'g', greetings: [{ hours: [23, 5], texts: ['夜'] }, { hours: [5, 11], texts: ['早'] }] })
    expect(findGreeting([p], now)?.texts).toEqual(['夜'])
    expect(findGreeting([p], new Date(2026, 9, 11, 3))?.texts).toEqual(['夜'])
    expect(findGreeting([p], new Date(2026, 9, 11, 8))?.texts).toEqual(['早'])
    expect(findGreeting([p], new Date(2026, 9, 11, 12))).toBeNull()
  })

  it('命令匹配忽略大小写和首尾空格', () => {
    const p = plugin({ id: 'c', commands: [{ trigger: '/Time', reply: 'x' }] })
    expect(findCommand([p], '  /time ')?.command.trigger).toBe('/Time')
    expect(findCommand([p], '/time now')).toBeNull()
  })

  it('启用状态：用户设置优先于 enabledByDefault', () => {
    const p = plugin({ id: 'e', enabledByDefault: false })
    expect(isPluginEnabled(p.manifest, {})).toBe(false)
    expect(isPluginEnabled(p.manifest, { e: true })).toBe(true)
  })

  it('汇总系统提示词', () => {
    expect(pluginSystemPrompt([plugin({ id: 's', systemPrompt: '叫我阿深' })])).toBe('【插件：测试】叫我阿深')
  })
})

describe('PluginScheduler', () => {
  const start = new Date(2026, 9, 11, 10, 0).getTime()
  const at = (minutes: number) => new Date(start + minutes * 60_000)

  it('every 提醒按间隔触发，并遵守 activeHours', () => {
    const scheduler = new PluginScheduler(start)
    scheduler.setPlugins([plugin({ id: 'r', reminders: [{ every: 45, activeHours: [9, 11], text: '喝水' }] })], start)
    expect(scheduler.tick(at(44), context)).toEqual([])
    expect(scheduler.tick(at(45), context).map((m) => m.text)).toEqual(['喝水'])
    expect(scheduler.tick(at(60), context)).toEqual([])
    // 11 点以后不在 activeHours 内
    expect(scheduler.tick(at(90), context)).toEqual([])
  })

  it('at 提醒每天只触发一次，并遵守 weekdays', () => {
    const scheduler = new PluginScheduler(start)
    scheduler.setPlugins([plugin({ id: 'a', reminders: [{ at: '10:30', weekdays: [0], text: '{time} 到了' }] })], start)
    expect(scheduler.tick(at(30), context).map((m) => m.text)).toEqual(['10:30 到了'])
    expect(scheduler.tick(new Date(start + 30 * 60_000 + 20_000), context)).toEqual([])
    // 第二天是周一，不在 weekdays 内
    expect(scheduler.tick(at(30 + 24 * 60), context)).toEqual([])
  })

  it('闲聊在无互动一段时间后触发，用户说话后重新计时', () => {
    const scheduler = new PluginScheduler(start)
    scheduler.setPlugins([plugin({ id: 'i', idle: { afterMinutes: 10, texts: ['在吗'] } })], start)
    expect(scheduler.tick(at(9), context)).toEqual([])
    expect(scheduler.tick(at(10), context)).toHaveLength(1)
    expect(scheduler.tick(at(15), context)).toEqual([])
    scheduler.noteInteraction(at(16).getTime())
    expect(scheduler.tick(at(25), context)).toEqual([])
    expect(scheduler.tick(at(26), context)).toHaveLength(1)
  })
})
