import { describe, expect, it } from 'vitest'
import { parseBlocksCompileJson } from '../src/blocks-backend.js'

describe('parseBlocksCompileJson', () => {
  it('accepts valid ascii mode with source', () => {
    const result = parseBlocksCompileJson({ mode: 'ascii', source: '+--+' })
    expect(result.mode).toBe('ascii')
    expect(result.source).toBe('+--+')
    expect(result.svgbobCommand).toBeUndefined()
  })

  it('accepts all valid modes', () => {
    for (const mode of ['ascii', 'markdown_table', 'markdown_tables']) {
      const result = parseBlocksCompileJson({ mode, source: 'x' })
      expect(result.mode).toBe(mode)
    }
  })

  it('throws on unknown mode', () => {
    expect(() => parseBlocksCompileJson({ mode: 'svg', source: 'x' })).toThrow(/mode/)
  })

  it('throws when source is missing', () => {
    expect(() => parseBlocksCompileJson({ mode: 'ascii' })).toThrow(/source/)
  })

  it('throws when source is not a string', () => {
    expect(() => parseBlocksCompileJson({ mode: 'ascii', source: 42 })).toThrow(/source/)
  })

  // TX-R001: svgbobCommand allowlist validation
  describe('svgbobCommand validation (TX-R001)', () => {
    it('accepts plain command name', () => {
      const result = parseBlocksCompileJson({ mode: 'ascii', source: 'x', svgbobCommand: 'svgbob_cli' })
      expect(result.svgbobCommand).toBe('svgbob_cli')
    })

    it('accepts absolute Unix path', () => {
      const result = parseBlocksCompileJson({ mode: 'ascii', source: 'x', svgbobCommand: '/usr/local/bin/svgbob_cli' })
      expect(result.svgbobCommand).toBe('/usr/local/bin/svgbob_cli')
    })

    it('accepts absolute Windows path', () => {
      const result = parseBlocksCompileJson({ mode: 'ascii', source: 'x', svgbobCommand: 'C:\\Users\\user\\.cargo\\bin\\svgbob_cli.exe' })
      expect(result.svgbobCommand).toBe('C:\\Users\\user\\.cargo\\bin\\svgbob_cli.exe')
    })

    it('rejects command with shell metacharacters (semicolon)', () => {
      expect(() =>
        parseBlocksCompileJson({ mode: 'ascii', source: 'x', svgbobCommand: 'svgbob_cli; rm -rf /' })
      ).toThrow(/invalid characters/)
    })

    it('rejects command with shell metacharacters (pipe)', () => {
      expect(() =>
        parseBlocksCompileJson({ mode: 'ascii', source: 'x', svgbobCommand: 'svgbob_cli | cat /etc/passwd' })
      ).toThrow(/invalid characters/)
    })

    it('rejects command with backtick injection', () => {
      expect(() =>
        parseBlocksCompileJson({ mode: 'ascii', source: 'x', svgbobCommand: '`whoami`' })
      ).toThrow(/invalid characters/)
    })

    it('rejects command with dollar substitution', () => {
      expect(() =>
        parseBlocksCompileJson({ mode: 'ascii', source: 'x', svgbobCommand: '$(evil)' })
      ).toThrow(/invalid characters/)
    })

    it('ignores svgbobCommand when it is empty string', () => {
      const result = parseBlocksCompileJson({ mode: 'ascii', source: 'x', svgbobCommand: '   ' })
      expect(result.svgbobCommand).toBeUndefined()
    })

    it('ignores svgbobCommand when it is not a string', () => {
      const result = parseBlocksCompileJson({ mode: 'ascii', source: 'x', svgbobCommand: 123 })
      expect(result.svgbobCommand).toBeUndefined()
    })
  })
})
