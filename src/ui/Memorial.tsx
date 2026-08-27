import { useGame } from '../sim/store'
import { lifespan, toMemorial, type MemorialEntry } from '../sim/memorial'
import type { CatState } from '../sim/types'

/**
 * A tela que aparece uma única vez, quando o gato morre.
 *
 * Sem botão de desfazer, sem "tentar de novo com o mesmo gato". O que ela faz é
 * dizer quem ele era — porque a personalidade veio de uma semente que não vai
 * se repetir, e o próximo gato vai ser outro.
 */
export function Memorial({ cat }: { cat: CatState }) {
  const reset = useGame((s) => s.reset)
  const m = toMemorial(cat)

  return (
    <div className="memorial">
      <div className="memorial-inner">
        <div className="memorial-mark">🕯️</div>
        <h1>{m.name}</h1>
        <div className="memorial-life">
          Viveu {lifespan(m)} · {m.weight.toFixed(2)} kg
        </div>
        <div className="memorial-cause">{m.cause}</div>

        {m.traits.length > 0 && (
          <>
            <div className="memorial-label">Quem ele era</div>
            <div className="memorial-traits">
              {m.traits.map((t) => (
                <span className="tag" key={t}>{t}</span>
              ))}
            </div>
          </>
        )}

        <div className="memorial-label">O que vocês tiveram</div>
        <div className="memorial-stats">
          <MemStat k="Dias bem cuidado" v={String(m.daysCaredFor)} />
          <MemStat k="Refeições" v={String(m.meals)} />
          <MemStat k="Brincadeiras" v={String(m.plays)} />
          <MemStat k="Vínculo" v={`${m.bond}%`} />
        </div>

        <p className="memorial-note">
          Nenhum outro gato vai ter o temperamento dele. O próximo será outro
          bicho, com outras manias — e vai levar tempo até confiar em você.
        </p>

        <button className="btn" onClick={reset}>
          Continuar
        </button>
      </div>
    </div>
  )
}

function MemStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="stat">
      <div className="stat-k">{k}</div>
      <div className="stat-v">{v}</div>
    </div>
  )
}

/** Lista compacta dos gatos anteriores, mostrada na tela de adoção. */
export function PastCats({ list }: { list: MemorialEntry[] }) {
  if (list.length === 0) return null
  return (
    <div className="past">
      <div className="past-label">
        {list.length === 1 ? 'Antes dele' : `${list.length} gatos antes`}
      </div>
      {list.slice(0, 3).map((m) => (
        <div className="past-row" key={`${m.seed}-${m.birth}`}>
          <span className="past-name">{m.name}</span>
          <span className="past-meta">{lifespan(m)} · {m.cause}</span>
        </div>
      ))}
    </div>
  )
}
