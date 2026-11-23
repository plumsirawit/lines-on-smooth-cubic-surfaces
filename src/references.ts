/**
 * Bibliography. Entries are listed in order of first citation on the page, which gives their
 * numbers. Cite in page text with [@key] or [@key, locator]; several keys: [@a; @b].
 */
export type Reference = {
  id: string
  authors: string
  title: string
  year: number
} & (
  | { kind: 'article'; journal: string; volume: string; number?: string; pages: string }
  | { kind: 'book'; publisher: string; series?: string; edition?: string }
)

export const REFERENCES: Reference[] = [
  {
    id: 'cayley1849',
    kind: 'article',
    authors: 'A. Cayley',
    title: 'On the triple tangent planes of surfaces of the third order',
    journal: 'Cambridge and Dublin Mathematical Journal',
    volume: '4',
    year: 1849,
    pages: '118–132',
  },
  {
    id: 'salmon1849',
    kind: 'article',
    authors: 'G. Salmon',
    title: 'On the triple tangent planes to a surface of the third order',
    journal: 'Cambridge and Dublin Mathematical Journal',
    volume: '4',
    year: 1849,
    pages: '252–260',
  },
  {
    id: 'cayley1869',
    kind: 'article',
    authors: 'A. Cayley',
    title: 'A memoir on cubic surfaces',
    journal: 'Philosophical Transactions of the Royal Society of London',
    volume: '159',
    year: 1869,
    pages: '231–326',
  },
  {
    id: 'hartshorne',
    kind: 'book',
    authors: 'R. Hartshorne',
    title: 'Algebraic Geometry',
    series: 'Graduate Texts in Mathematics 52',
    publisher: 'Springer, New York',
    year: 1977,
  },
  {
    id: 'reid',
    kind: 'book',
    authors: 'M. Reid',
    title: 'Undergraduate Algebraic Geometry',
    series: 'London Mathematical Society Student Texts 12',
    publisher: 'Cambridge University Press, Cambridge',
    year: 1988,
  },
  {
    id: 'dolgachev',
    kind: 'book',
    authors: 'I. V. Dolgachev',
    title: 'Classical Algebraic Geometry: A Modern View',
    publisher: 'Cambridge University Press, Cambridge',
    year: 2012,
  },
  {
    id: 'schlafli1858',
    kind: 'article',
    authors: 'L. Schläfli',
    title:
      'An attempt to determine the twenty-seven lines upon a surface of the third order, and to divide such surfaces into species in reference to the reality of the lines upon the surface',
    journal: 'Quarterly Journal of Pure and Applied Mathematics',
    volume: '2',
    year: 1858,
    pages: '55–65, 110–120',
  },
  {
    id: 'segre',
    kind: 'book',
    authors: 'B. Segre',
    title: 'The Non-singular Cubic Surfaces',
    publisher: 'Oxford University Press, Oxford',
    year: 1942,
  },
  {
    id: 'clebsch1871',
    kind: 'article',
    authors: 'A. Clebsch',
    title:
      'Ueber die Anwendung der quadratischen Substitution auf die Gleichungen 5ten Grades und die geometrische Theorie des ebenen Fünfseits',
    journal: 'Mathematische Annalen',
    volume: '4',
    year: 1871,
    pages: '284–345',
  },
  {
    id: 'clo',
    kind: 'book',
    authors: 'D. A. Cox, J. Little and D. O’Shea',
    title: 'Using Algebraic Geometry',
    edition: '2nd ed.',
    series: 'Graduate Texts in Mathematics 185',
    publisher: 'Springer, New York',
    year: 2005,
  },
  {
    id: 'sommese-wampler',
    kind: 'book',
    authors: 'A. J. Sommese and C. W. Wampler',
    title: 'The Numerical Solution of Systems of Polynomials Arising in Engineering and Science',
    publisher: 'World Scientific, Singapore',
    year: 2005,
  },
  {
    id: 'doi-koide',
    kind: 'article',
    authors: 'A. Doi and A. Koide',
    title: 'An efficient method of triangulating equi-valued surfaces by using tetrahedral cells',
    journal: 'IEICE Transactions on Information and Systems',
    volume: 'E74-D',
    number: '1',
    year: 1991,
    pages: '214–224',
  },
]

const NUMBERS = new Map(REFERENCES.map((r, i) => [r.id, i + 1]))

/** Citation number of a reference; throws on unknown keys so typos fail loudly in dev. */
export function citationNumber(id: string): number {
  const n = NUMBERS.get(id)
  if (n === undefined) throw new Error(`Unknown reference "${id}"`)
  return n
}
