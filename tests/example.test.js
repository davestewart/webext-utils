import { describe, it, expect } from 'vitest'

function add(a, b) {
  return a + b
}

describe('example tests', () => {
  it('should add two numbers', () => {
    expect(add(2, 3)).toBe(5)
  })
})
