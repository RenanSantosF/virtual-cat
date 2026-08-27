import { useState } from 'react'
import { useGame } from '../sim/store'

export function Adopt() {
  const adopt = useGame((s) => s.adopt)
  const [name, setName] = useState('')

  return (
    <div className="adopt">
      <h1>Um gato de verdade</h1>
      <p>
        Ele chega com oito semanas, do tamanho de duas mãos, e cresce no ritmo de um
        gato real — meses, não minutos.
      </p>
      <p>
        Tem fome, sede, sono e limites. Ele não obedece: decide. Se você cuidar bem,
        um dia ele vem dormir perto de você.
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
      </p>
    </div>
  )
}
