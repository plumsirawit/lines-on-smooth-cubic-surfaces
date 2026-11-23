/** Exact rational numbers backed by BigInt. Always normalised: gcd(n, d) = 1, d > 0. */
export type Rational = { readonly n: bigint; readonly d: bigint }

function gcd(a: bigint, b: bigint): bigint {
  if (a < 0n) a = -a
  if (b < 0n) b = -b
  while (b !== 0n) [a, b] = [b, a % b]
  return a
}

export function rat(n: bigint | number, d: bigint | number = 1n): Rational {
  let nn = BigInt(n)
  let dd = BigInt(d)
  if (dd === 0n) throw new RangeError('Division by zero')
  if (dd < 0n) {
    nn = -nn
    dd = -dd
  }
  const g = gcd(nn, dd)
  return g > 1n ? { n: nn / g, d: dd / g } : { n: nn, d: dd }
}

export const ZERO = rat(0)
export const ONE = rat(1)

export const isZero = (a: Rational) => a.n === 0n
export const add = (a: Rational, b: Rational) => rat(a.n * b.d + b.n * a.d, a.d * b.d)
export const sub = (a: Rational, b: Rational) => rat(a.n * b.d - b.n * a.d, a.d * b.d)
export const mul = (a: Rational, b: Rational) => rat(a.n * b.n, a.d * b.d)
export const neg = (a: Rational): Rational => ({ n: -a.n, d: a.d })
export function div(a: Rational, b: Rational): Rational {
  if (b.n === 0n) throw new RangeError('Division by zero')
  return rat(a.n * b.d, a.d * b.n)
}

/** Parses a non-negative decimal literal such as "12", "0.25" or ".5". */
export function parseDecimal(s: string): Rational {
  const [whole, frac = ''] = s.split('.')
  return rat(BigInt((whole || '0') + frac), 10n ** BigInt(frac.length))
}

export function toNumber(a: Rational): number {
  return Number(a.n) / Number(a.d)
}

export function toString(a: Rational): string {
  return a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`
}
