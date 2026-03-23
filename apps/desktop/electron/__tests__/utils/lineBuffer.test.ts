// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { createLineBuffer } from '../../main/utils/lineBuffer'

describe('createLineBuffer', () => {
  it('emits separate lines for carriage-return progress updates', () => {
    const onLine = vi.fn()
    const buffer = createLineBuffer(onLine)

    buffer.push(Buffer.from('10%\r20%\r'))

    expect(onLine.mock.calls.map(([line]) => line)).toEqual(['10%', '20%'])
  })
})
