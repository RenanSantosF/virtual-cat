import { BEHAVIOR_LABEL } from '../ai/brain'
import { ILLNESS_LABEL, foodSpoilage, litterFilth } from '../sim/engine'
import { ageLabel, weightKg } from '../sim/growth'
import type { CatState, NeedKey } from '../sim/types'

const NEEDS: Array<{ key: NeedKey; label: string; icon: string }> = [
  { key: 'hunger', label: 'Fome', icon: '🍖' },
  { key: 'thirst', label: 'Sede', icon: '💧' },
  { key: 'energy', label: 'Energia', icon: '🌙' },
  { key: 'bladder', label: 'Bexiga', icon: '🚽' },
  { key: 'hygiene', label: 'Higiene', icon: '🧼' },
  { key: 'stimulation', label: 'Tédio', icon: '🎯' },
  { key: 'affection', label: 'Carinho', icon: '💛' },
]

function barColor(v: number): string {
  if (v > 55) return '#7fbf6a'
  if (v > 28) return '#e0b25c'
  return '#d76b5c'
}

/** Humor legível a partir de estresse, saúde e vínculo. */
export function moodOf(cat: CatState): string {
  if (cat.health < 45) return 'debilitado'
  if (cat.stress > 78) return 'apavorado'
  if (cat.stress > 55) return 'tenso'
  if (cat.needs.hunger < 22) return 'faminto'
  if (cat.bond > 68 && cat.stress < 28) return 'à vontade'
  if (cat.bond < 22) return 'desconfiado'
  return 'tranquilo'
}

export function alertsFor(cat: CatState, now: number): Array<{ text: string; level: 'bad' | 'warn' }> {
  const out: Array<{ text: string; level: 'bad' | 'warn' }> = []
  for (const ill of cat.illnesses) {
    out.push({ text: `${ILLNESS_LABEL[ill.kind]} — precisa de tratamento`, level: 'bad' })
  }
  if (cat.bowl.food <= 1) out.push({ text: 'O pote de comida está vazio', level: cat.needs.hunger < 40 ? 'bad' : 'warn' })
  else if (foodSpoilage(cat, now) > 0.9) out.push({ text: 'A comida no pote estragou', level: 'warn' })
  if (cat.bowl.water <= 1) out.push({ text: 'Sem água no pote', level: cat.needs.thirst < 45 ? 'bad' : 'warn' })
  else if (now - cat.bowl.waterFilledAt > 2 * 86_400_000) {
    out.push({ text: 'A água está parada há dois dias', level: 'warn' })
  }
  const filth = litterFilth(cat, now)
  if (filth > 0.82) out.push({ text: 'A caixa de areia está imunda', level: 'bad' })
  else if (filth > 0.55) out.push({ text: 'A caixa precisa de limpeza', level: 'warn' })
  if (cat.health < 55) out.push({ text: 'Saúde caindo — leve ao veterinário', level: 'bad' })
  return out.slice(0, 3)
}

export function Hud({ cat, now, coatLabel }: { cat: CatState; now: number; coatLabel: string }) {
  const alerts = alertsFor(cat, now)
  return (
    <div className="hud">
      <div className="hud-top">
        <div>
          <div className="hud-name">{cat.name}</div>
          <div className="hud-sub">
            {ageLabel(cat.birth, now)} · {weightKg(cat.birth, now).toFixed(2)} kg · {coatLabel}
          </div>
        </div>
        <div className="hud-spacer" />
        <div className="coins">🪙 {Math.floor(cat.inventory.coins)}</div>
      </div>

      <div className="bars">
        {NEEDS.map(({ key, label, icon }) => {
          const v = cat.needs[key]
          return (
            <div className="bar-row" key={key}>
              <span className="bar-icon">{icon}</span>
              <span className="bar-label">{label}</span>
              <span className="bar-track">
                <span
                  className="bar-fill"
                  style={{ width: `${Math.max(2, v)}%`, background: barColor(v) }}
                />
              </span>
            </div>
          )
        })}
        <div className="bar-row">
          <span className="bar-icon">❤️</span>
          <span className="bar-label">Saúde</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${Math.max(2, cat.health)}%`, background: barColor(cat.health) }}
            />
          </span>
        </div>
      </div>

      <div className="state-line">
        {BEHAVIOR_LABEL[cat.behavior]} <span className="mood">· {moodOf(cat)}</span>
      </div>

      {alerts.length > 0 && (
        <div className="alerts">
          {alerts.map((a) => (
            <div key={a.text} className={a.level === 'warn' ? 'alert warn' : 'alert'}>
              {a.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
