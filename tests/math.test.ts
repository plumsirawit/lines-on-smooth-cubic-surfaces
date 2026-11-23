import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePolynomial } from '../src/math/parse.ts'
import { analyzeCubic } from '../src/math/cubic.ts'
import { findLines, toAffine } from '../src/math/lines.ts'
import * as P from '../src/math/poly.ts'

const lineCounts = (src: string) => {
  const a = analyzeCubic(src)
  assert.ok(a.ok, `expected smooth cubic: ${src}`)
  return findLines(P.toFloatTerms(a.F))
}

test('parser: implicit multiplication, powers, equations', () => {
  assert.equal(P.format(parsePolynomial('2xy + x^2y - (x+1)(x-1)')), 'x^2*y - x^2 + 2*x*y + 1')
  assert.equal(P.format(parsePolynomial('x³ + y**3 = z/2')), 'x^3 + y^3 - 1/2*z')
  assert.equal(P.format(parsePolynomial('-x^2')), '-x^2')
  assert.equal(P.format(parsePolynomial('0.5x - 1/2 x')), '0')
  assert.throws(() => parsePolynomial('x + q'), /Unknown variable/)
  assert.throws(() => parsePolynomial('x^y'), /non-negative integer/)
  assert.throws(() => parsePolynomial('x / y'), /divide by a constant/)
  assert.throws(() => parsePolynomial('(x + 1'), /Expected "\)"/)
})

test('cubic validation', () => {
  assert.match((analyzeCubic('x^2 + y^2 + z^2 - 1') as { error: string }).error, /degree 2/)
  assert.match((analyzeCubic('x^3 + w^2') as { error: string }).error, /homogeneous/)
  assert.match((analyzeCubic('x^4 + y^4 + z^4 + w^4') as { error: string }).error, /degree 4/)
})

test('smoothness: smooth examples', () => {
  for (const s of ['x^3 + y^3 + z^3 + w^3', 'x^3 + y^3 + z^3 = 1', 'x^3+y^3+z^3+w^3 - (x+y+z+w)^3']) {
    assert.ok(analyzeCubic(s).ok, s)
  }
})

test('smoothness: singular examples', () => {
  for (const s of [
    'x^3 + y^3 + z^3', // cone
    'xyz = 1', // singular at infinity
    'xyz + xyw + xzw + yzw', // Cayley nodal cubic
    'x^2 + y^2 - z^2 + x^3 + y^3 + z^3', // node at the origin
    'x^3 + y^3 + z^2 w', // singular at [0:0:0:1]
  ]) {
    assert.equal(analyzeCubic(s).ok, false, s)
  }
})

test('Fermat cubic: 27 lines, 3 real', () => {
  const r = lineCounts('x^3 + y^3 + z^3 + w^3')
  assert.equal(r.complexCount, 27)
  assert.equal(r.realLines.length, 3)
})

test('Clebsch diagonal surface: 27 real lines', () => {
  const r = lineCounts('x^3+y^3+z^3+w^3 - (x+y+z+w)^3')
  assert.equal(r.complexCount, 27)
  assert.equal(r.realLines.length, 27)
})

test('real lines lie on the surface', () => {
  const src = 'x^3+y^3+z^3+w^3 - (x+y+z+w)^3'
  const a = analyzeCubic(src)
  assert.ok(a.ok)
  const terms = P.toFloatTerms(a.F)
  const f = (X: number[]) => terms.reduce((s, [c, ...e]) => s + c * e.reduce((m, k, i) => m * X[i] ** k, 1), 0)
  for (const { p, q } of findLines(terms).realLines) {
    for (const t of [-2, -0.3, 0.7, 3]) {
      const X = p.map((pi, i) => pi + t * q[i])
      assert.ok(Math.abs(f(X)) < 1e-8 * Math.hypot(...X) ** 3, `F != 0 on line at t=${t}`)
    }
    const aff = toAffine(p, q)
    if (aff.kind === 'affine') assert.ok(Math.abs(Math.hypot(...aff.direction) - 1) < 1e-9)
  }
})
