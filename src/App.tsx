import { Adopt } from './ui/Adopt'
import { Game } from './ui/Game'
import { Memorial } from './ui/Memorial'
import { useGame } from './sim/store'

export default function App() {
  const cat = useGame((s) => s.cat)
  if (!cat) return <Adopt />
  // Um gato morto não volta a jogar: o que resta é o memorial.
  if (cat.died) return <Memorial cat={cat} />
  return <Game cat={cat} />
}
