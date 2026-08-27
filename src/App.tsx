import { Adopt } from './ui/Adopt'
import { Game } from './ui/Game'
import { useGame } from './sim/store'

export default function App() {
  const cat = useGame((s) => s.cat)
  return cat ? <Game cat={cat} /> : <Adopt />
}
