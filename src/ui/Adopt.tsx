import { useMemo, useState } from 'react'
import { useGame } from '../sim/store'
import { readMemorials } from '../sim/memorial'
import { PastCats } from './Memorial'

export function Adopt() {
  const adopt = useGame((s) => s.adopt)
  const [name, setName] = useState('')
  const past = useMemo(() => readMemorials(), [])

  return (
    <div className="adopt">
      <h1>Um gato de verdade</h1>
      <p>
        Ele chega com oito semanas, do tamanho de duas mãos, e cresce no ritmo de um
        gato real — meses, não minutos.
      </p>
      <p>
        Tem fome, sede, sono e limites. Ele não obedece: decide. Se você cuidar bem,
        um dia ele vem dormir perto de você. Se você não cuidar, ele adoece — e
        gato não reclama de dor.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Como ele vai se chamar?"
        maxLength={18}
        autoComplete="off"
      />
      <button className="btn" onClick={() => adopt(name)}>
        Trazer para casa
      </button>
      <p className="fine">
        O tempo corre mesmo com o app fechado. Deixe ração e água antes de sair.
        Ele esconde quando adoece — reparar é com você.
      </p>
      <PastCats list={past} />
    </div>
  )
}
