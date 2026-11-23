import * as P from './poly.ts'
import type { Poly } from './poly.ts'
import * as Q from './rational.ts'

export class ParseError extends Error {
  readonly position: number
  constructor(message: string, position: number) {
    super(message)
    this.position = position
  }
}

type OpValue = '+' | '-' | '*' | '/' | '^' | '(' | ')' | '='

type Token =
  | { kind: 'num'; value: string; pos: number }
  | { kind: 'var'; index: number; pos: number }
  | { kind: 'op'; value: OpValue; pos: number }
  | { kind: 'end'; pos: number }

/** Highest degree allowed in intermediate results, to keep typos like (x+y)^99 cheap to reject. */
const MAX_DEGREE = 12

const SUPERSCRIPTS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
    } else if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i))
      if (!m) throw new ParseError(`Unexpected "${ch}"`, i)
      tokens.push({ kind: 'num', value: m[1], pos: i })
      i += m[1].length
    } else if (/[a-zA-Z]/.test(ch)) {
      const index = P.VARS.indexOf(ch.toLowerCase() as (typeof P.VARS)[number])
      if (index < 0) throw new ParseError(`Unknown variable "${ch}" (use x, y, z and optionally w)`, i)
      tokens.push({ kind: 'var', index, pos: i })
      i++
    } else if (ch in SUPERSCRIPTS) {
      let digits = ''
      const pos = i
      while (i < src.length && src[i] in SUPERSCRIPTS) digits += SUPERSCRIPTS[src[i++]]
      tokens.push({ kind: 'op', value: '^', pos }, { kind: 'num', value: digits, pos })
    } else if (src.startsWith('**', i)) {
      tokens.push({ kind: 'op', value: '^', pos: i })
      i += 2
    } else {
      const map: Record<string, OpValue> = {
        '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '·': '*', '×': '*', '/': '/', '^': '^', '(': '(', ')': ')', '=': '=',
      }
      const value = map[ch]
      if (!value) throw new ParseError(`Unexpected character "${ch}"`, i)
      tokens.push({ kind: 'op', value, pos: i })
      i++
    }
  }
  tokens.push({ kind: 'end', pos: src.length })
  return tokens
}

/**
 * Parses a polynomial in x, y, z, w. Supports + - * / ^ (or **), parentheses, decimals,
 * implicit multiplication ("2xy", "(x+1)(y-1)", "x^2y") and an optional "=" (moved to one side).
 */
export function parsePolynomial(src: string): Poly {
  const tokens = tokenize(src)
  let t = 0
  const peek = () => tokens[t]
  const isOp = (v: string) => {
    const tok = peek()
    return tok.kind === 'op' && tok.value === v
  }
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new ParseError(`Expected "${v}"`, peek().pos)
    t++
  }
  const checkDegree = (p: Poly, pos: number) => {
    if (P.degree(p) > MAX_DEGREE) throw new ParseError(`Degree exceeds ${MAX_DEGREE}`, pos)
    return p
  }

  function expr(): Poly {
    let acc = term()
    while (isOp('+') || isOp('-')) {
      const op = (peek() as { value: string }).value
      t++
      const rhs = term()
      acc = op === '+' ? P.add(acc, rhs) : P.sub(acc, rhs)
    }
    return acc
  }

  function term(): Poly {
    let acc = unary()
    for (;;) {
      const tok = peek()
      if (isOp('*')) {
        t++
        acc = checkDegree(P.mul(acc, unary()), tok.pos)
      } else if (isOp('/')) {
        t++
        const rhs = unary()
        const c = P.asConstant(rhs)
        if (!c) throw new ParseError('Can only divide by a constant', tok.pos)
        if (Q.isZero(c)) throw new ParseError('Division by zero', tok.pos)
        acc = P.scale(acc, Q.div(Q.ONE, c))
      } else if (tok.kind === 'num' || tok.kind === 'var' || isOp('(')) {
        acc = checkDegree(P.mul(acc, power()), tok.pos) // implicit multiplication
      } else {
        return acc
      }
    }
  }

  function unary(): Poly {
    if (isOp('-')) {
      t++
      return P.neg(unary())
    }
    if (isOp('+')) {
      t++
      return unary()
    }
    return power()
  }

  function power(): Poly {
    const base = atom()
    if (!isOp('^')) return base
    const pos = peek().pos
    t++
    const expTok = peek()
    const exponent = P.asConstant(unary())
    if (!exponent || exponent.d !== 1n || exponent.n < 0n) {
      throw new ParseError('Exponent must be a non-negative integer', expTok.pos)
    }
    const n = Number(exponent.n)
    if (n * Math.max(P.degree(base), 0) > MAX_DEGREE || n > 64) throw new ParseError('Exponent too large', pos)
    return P.pow(base, n)
  }

  function atom(): Poly {
    const tok = peek()
    if (tok.kind === 'num') {
      t++
      return P.constant(Q.parseDecimal(tok.value))
    }
    if (tok.kind === 'var') {
      t++
      return P.variable(tok.index)
    }
    if (isOp('(')) {
      t++
      const inner = expr()
      expectOp(')')
      return inner
    }
    if (tok.kind === 'end') throw new ParseError('Unexpected end of input', tok.pos)
    throw new ParseError(`Unexpected "${tok.value}"`, tok.pos)
  }

  if (peek().kind === 'end') throw new ParseError('Enter a polynomial', 0)
  let result = expr()
  if (isOp('=')) {
    t++
    result = P.sub(result, expr())
  }
  if (peek().kind !== 'end') {
    const tok = peek()
    throw new ParseError(tok.kind === 'op' && tok.value === ')' ? 'Unmatched ")"' : 'Unexpected input', tok.pos)
  }
  return result
}
