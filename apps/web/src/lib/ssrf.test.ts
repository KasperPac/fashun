import { describe, it, expect } from 'vitest'
import { isPubliclyFetchable } from './ssrf'

describe('isPubliclyFetchable', () => {
  it('allows public http(s) URLs', () => {
    expect(isPubliclyFetchable('https://www.kmart.com.au/p/1')).toBe(true)
    expect(isPubliclyFetchable('http://example.com/x.jpg')).toBe(true)
  })
  it('rejects non-http(s) schemes', () => {
    expect(isPubliclyFetchable('ftp://example.com')).toBe(false)
    expect(isPubliclyFetchable('file:///etc/passwd')).toBe(false)
    expect(isPubliclyFetchable('not a url')).toBe(false)
  })
  it('rejects loopback and localhost', () => {
    expect(isPubliclyFetchable('http://localhost/admin')).toBe(false)
    expect(isPubliclyFetchable('http://127.0.0.1/x')).toBe(false)
    expect(isPubliclyFetchable('http://[::1]/x')).toBe(false)
  })
  it('rejects private and link-local ranges', () => {
    expect(isPubliclyFetchable('http://10.0.0.5/internal')).toBe(false)
    expect(isPubliclyFetchable('http://192.168.1.1/x')).toBe(false)
    expect(isPubliclyFetchable('http://172.16.0.1/x')).toBe(false)
    expect(isPubliclyFetchable('http://169.254.169.254/latest/meta-data')).toBe(false)
  })
})
