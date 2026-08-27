import { Sheet } from './Sheet'
import { SHOP, VET_PRICE, buy, giveMedicine, recommendedFood, serveFood, vetVisit, type ActionResult } from '../sim/actions'
import { ILLNESS_LABEL, ILLNESS_SIGN, isTreatableAtHome } from '../sim/engine'
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
  const needsVet = cat.illnesses.some((i) => !isTreatableAtHome(i.kind)) || cat.health < 55
  const daysSinceVet = Math.floor((now - cat.lastVetVisit) / MS_DAY)

  return (
    <Sheet
      title="Saúde"
      hint={`Saúde ${Math.round(cat.health)}/100 · última consulta há ${daysSinceVet} ${daysSinceVet === 1 ? 'dia' : 'dias'}.`}
      onClose={onClose}
    >
      {cat.illnesses.length === 0 ? (
        <p className="hint" style={{ marginBottom: 16 }}>
          Nenhum sintoma no momento. Vermifugação a cada seis meses evita a maioria dos problemas.
        </p>
      ) : (
        cat.illnesses.map((ill) => (
          <div className="row" key={ill.kind}>
            <span className="row-icon">🩺</span>
            <div className="row-body">
              <div className="row-title">
                {ILLNESS_LABEL[ill.kind]}
                <span className="tag" style={{ marginLeft: 6 }}>
                  {ill.severity > 0.6 ? 'grave' : ill.severity > 0.3 ? 'moderado' : 'leve'}
                </span>
              </div>
              <div className="row-desc">{ILLNESS_SIGN[ill.kind]}</div>
            </div>
          </div>
        ))
      )}

      <h2 style={{ marginTop: 18 }}>Remédios</h2>
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
        Resolve qualquer quadro, inclusive os que não têm remédio em casa. Ele vai odiar a viagem —
        o estresse sobe bastante depois da consulta.
      </p>
      <div className="row">
        <span className="row-icon">🏥</span>
        <div className="row-body">
          <div className="row-title">Consulta completa</div>
          <div className="row-desc">{needsVet ? 'Recomendada agora.' : 'Sem indicação no momento.'}</div>
        </div>
        <button
          className={needsVet ? 'btn' : 'btn ghost'}
          disabled={cat.inventory.coins < VET_PRICE}
          onClick={() => run(() => vetVisit(cat, Date.now()))}
        >
          🪙 {VET_PRICE}
        </button>
      </div>
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
