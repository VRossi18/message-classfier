import { describe, expect, it } from 'vitest'
import { urgencyColor } from './sectors'

describe('urgencyColor', () => {
  it('verde para baixa, âmbar para média e vermelho para alta urgência', () => {
    expect(urgencyColor(0)).toBe('bg-emerald-500')
    expect(urgencyColor(25)).toBe('bg-emerald-500')
    expect(urgencyColor(39)).toBe('bg-emerald-500')
    expect(urgencyColor(40)).toBe('bg-amber-500')
    expect(urgencyColor(69)).toBe('bg-amber-500')
    expect(urgencyColor(70)).toBe('bg-rose-500')
    expect(urgencyColor(100)).toBe('bg-rose-500')
  })
})
