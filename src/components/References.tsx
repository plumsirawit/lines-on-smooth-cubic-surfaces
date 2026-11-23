import { REFERENCES } from '../references.ts'
import type { Reference } from '../references.ts'

function Entry({ r }: { r: Reference }) {
  if (r.kind === 'article') {
    return (
      <>
        {r.authors}, “{r.title},” <i>{r.journal}</i> <b>{r.volume}</b>
        {r.number && `, no. ${r.number}`} ({r.year}), {r.pages}.
      </>
    )
  }
  return (
    <>
      {r.authors}, <i>{r.title}</i>
      {r.edition && `, ${r.edition}`}
      {r.series && `, ${r.series}`}, {r.publisher}, {r.year}.
    </>
  )
}

export function References() {
  return (
    <ol className="references">
      {REFERENCES.map((r) => (
        <li key={r.id} id={`ref-${r.id}`}>
          <Entry r={r} />
        </li>
      ))}
    </ol>
  )
}
