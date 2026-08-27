import { Sheet } from './Sheet'
import {
  EMERGENCY_PRICE, SHOP, VET_PRICE, buy, emergencyVet, examineCat, giveMedicine,
  recommendedFood, serveFood, vetVisit, type ActionResult,
} from '../sim/actions'
import { isCritical } from '../sim/engine'
import { examine } from '../sim/symptoms'
import { ageLabel, lifeStage, STAGE_LABEL, weightKg, MS_DAY } from '../sim/growth'
import { describe } from '../sim/personality'
import type { CatState, FoodKind, ItemId } from '../sim/types'

const FOOD_ICON: Record<FoodKind, string> = {
  kibble: '🥫',
  wet: '🍗',
  kittenFormula: '🍼',
  treat: '🐟',
}

const ITEM_ICON: Record<ItemId, string> = {
  kibble: '🥫', wet: '🍗', kittenFormula: '🍼', treat: '🐟', litter: '🪣',
  dewormer: '💊', coldMedicine: '💊', hairballPaste: '🧴', brush: '🪮', wand: '🪶', ball: '⚽',
  fountain: '⛲',
}

interface PanelProps {
  cat: CatState
  now: number
  run: (fn: () => ActionResult) => void
}

export function FoodPanel({ cat, now, run, onClose }: PanelProps & { onClose: () => void }) {
  const rec = recommendedFood(cat, now)
  const foods: FoodKind[] = ['kittenFormula', 'kibble', 'wet', 'treat']
  return (
    <Sheet
      title="Alimentar"
      hint={
        cat.bowl.food > 1
          ? `Ainda há ${Math.round(cat.bowl.food)} g no pote. Gatos comem pouco e muitas vezes ao dia.`
          : 'O pote está vazio. Deixe comida antes de fechar o app — ele come sozinho.'
      }
      onClose={onClose}
    >
      {foods.map((f) => {
        const item = SHOP.find((s) => s.id === (f as ItemId))!
        const count = cat.inventory.items[f as ItemId] ?? 0
        return (
          <div className="row" key={f}>
            <span className="row-icon">{FOOD_ICON[f]}</span>
            <div className="row-body">
              <div className="row-title">
                {item.name}
                {f === rec && <span className="tag" style={{ marginLeft: 6 }}>indicado</span>}
              </div>
              <div className="row-desc">{item.desc}</div>
            </div>
            <span className="row-count">×{count}</span>
            <button
              className="btn"
              disabled={count === 0}
              onClick={() => run(() => serveFood(cat, f, Date.now()))}
            >
              Servir
            </button>
          </div>
        )
      })}
    </Sheet>
  )
}

export function ShopPanel({ cat, run, onClose }: Omit<PanelProps, 'now'> & { onClose: () => void }) {
  return (
    <Sheet
      title="Loja"
      hint={`${Math.floor(cat.inventory.coins)} moedas. Você ganha cuidando bem dele todos os dias.`}
      onClose={onClose}
    >
      {SHOP.map((s) => {
        const owned = cat.inventory.items[s.id] ?? 0
        const maxed = s.durable && owned > 0
        return (
          <div className="row" key={s.id}>
            <span className="row-icon">{ITEM_ICON[s.id]}</span>
            <div className="row-body">
              <div className="row-title">{s.name}</div>
              <div className="row-desc">{s.desc}</div>
            </div>
            {!s.durable && <span className="row-count">×{owned}</span>}
            <button
              className="btn"
              disabled={maxed || cat.inventory.coins < s.price}
              onClick={() => run(() => buy(cat, s.id))}
            >
              {maxed ? 'Seu' : `🪙 ${s.price}`}
            </button>
          </div>
        )
      })}
    </Sheet>
  )
}

export function HealthPanel({ cat, now, run, onClose }: PanelProps & { onClose: () => void }) {
  const meds: ItemId[] = ['dewormer', 'coldMedicine', 'hairballPaste']
  const signs = examine(cat, now)
  const daysSinceVet = Math.floor((now - cat.lastVetVisit) / MS_DAY)
  const critical = isCritical(cat)

  return (
    <Sheet
      title="Examinar"
      hint={`Última consulta há ${daysSinceVet} ${daysSinceVet === 1 ? 'dia' : 'dias'}. Gato esconde dor — o que dá para ver é isto.`}
      onClose={onClose}
    >
      <button className="btn ghost" style={{ width: '100%', marginBottom: 14 }}
        onClick={() => run(() => examineCat(cat, signs))}>
        🔍 Olhar de perto
      </button>

      {signs.length === 0 ? (
        <p className="hint" style={{ marginBottom: 16 }}>
          Nada de estranho no momento. Pelo no lugar, olhos limpos, respiração calma.
        </p>
      ) : (
        signs.map((sgn) => (
          <div className="row" key={sgn}>
            <span className="row-icon">👁️</span>
            <div className="row-body">
              <div className="row-desc" style={{ marginTop: 0, fontSize: 13, color: 'var(--text)' }}>{sgn}</div>
            </div>
          </div>
        ))
      )}

      <h2 style={{ marginTop: 18 }}>Remédios de casa</h2>
      <p className="hint">
        Dar remédio no escuro é chute: o errado não faz efeito e ainda estressa o gato.
      </p>
      {meds.map((m) => {
        const item = SHOP.find((s) => s.id === m)!
        const count = cat.inventory.items[m] ?? 0
        return (
          <div className="row" key={m}>
            <span className="row-icon">{ITEM_ICON[m]}</span>
            <div className="row-body">
              <div className="row-title">{item.name}</div>
              <div className="row-desc">{item.desc}</div>
            </div>
            <span className="row-count">×{count}</span>
            <button className="btn" disabled={count === 0} onClick={() => run(() => giveMedicine(cat, m))}>
              Dar
            </button>
          </div>
        )
      })}

      <h2 style={{ marginTop: 18 }}>Veterinário</h2>
      <p className="hint">
        É quem descobre o que ele tem. Você leva porque notou alguma coisa — e sai
        de lá sabendo o nome. Ele vai odiar a viagem.
      </p>
      <div className="row">
        <span className="row-icon">🏥</span>
        <div className="row-body">
          <div className="row-title">Consulta e diagnóstico</div>
          <div className="row-desc">Identifica e trata o que estiver acontecendo.</div>
        </div>
        <button
          className="btn"
          disabled={cat.inventory.coins < VET_PRICE}
          onClick={() => run(() => vetVisit(cat, Date.now()))}
        >
          🪙 {VET_PRICE}
        </button>
      </div>

      {critical && (
        <div className="row" style={{ marginTop: 4 }}>
          <span className="row-icon">🚑</span>
          <div className="row-body">
            <div className="row-title" style={{ color: 'var(--bad)' }}>Internação de emergência</div>
            <div className="row-desc">
              Ele está muito mal. Isto o tira do buraco — não há garantia de uma segunda chance.
            </div>
          </div>
          <button
            className="btn danger"
            disabled={cat.inventory.coins < EMERGENCY_PRICE}
            onClick={() => run(() => emergencyVet(cat, Date.now()))}
          >
            🪙 {EMERGENCY_PRICE}
          </button>
        </div>
      )}
    </Sheet>
  )
}

export function ProfilePanel({
  cat,
  now,
  coatLabel,
  onReset,
  onClose,
}: {
  cat: CatState
  now: number
  coatLabel: string
  onReset: () => void
  onClose: () => void
}) {
  const traits = describe(cat.personality)
  const known = cat.bond > 30
  return (
    <Sheet title={cat.name} hint={`${STAGE_LABEL[lifeStage(cat.birth, now)]} · ${coatLabel}`} onClose={onClose}>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-k">Idade</div>
          <div className="stat-v">{ageLabel(cat.birth, now)}</div>
        </div>
        <div className="stat">
          <div className="stat-k">Peso</div>
          <div className="stat-v">{weightKg(cat.birth, now).toFixed(2)} kg</div>
        </div>
        <div className="stat">
          <div className="stat-k">Vínculo</div>
          <div className="stat-v">{Math.round(cat.bond)}%</div>
        </div>
        <div className="stat">
          <div className="stat-k">Estresse</div>
          <div className="stat-v">{Math.round(cat.stress)}%</div>
        </div>
        <div className="stat">
          <div className="stat-k">Dias bem cuidado</div>
          <div className="stat-v">{cat.stats.daysCaredFor}</div>
        </div>
        <div className="stat">
          <div className="stat-k">Brincadeiras</div>
          <div className="stat-v">{cat.stats.plays}</div>
        </div>
      </div>

      <h2>Temperamento</h2>
      <p className="hint">
        {known
          ? 'O que você já percebeu convivendo com ele.'
          : 'Vocês ainda estão se conhecendo. Cuide bem por alguns dias e o temperamento aparece.'}
      </p>
      {known && (
        <div style={{ marginBottom: 14 }}>
          {traits.length > 0 ? (
            traits.map((t) => (
              <span className="tag" key={t}>
                {t}
              </span>
            ))
          ) : (
            <span className="tag">Equilibrado em tudo</span>
          )}
        </div>
      )}

      <h2 style={{ marginTop: 6 }}>Recomeçar</h2>
      <p className="hint">Apaga este gato e todo o histórico. Não tem volta.</p>
      <button className="btn danger" onClick={onReset}>
        Apagar {cat.name}
      </button>
    </Sheet>
  )
}
