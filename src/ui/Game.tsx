import { useEffect, useRef, useState } from 'react'
import { CatScene } from '../render/scene'
import { useGame } from '../sim/store'
import { brush, cleanLitter, dailyBonus, fillWater, has, playSession, type ActionResult } from '../sim/actions'
import { litterFilth } from '../sim/engine'
import { askNotifications, canAskNotifications, checkNotifications } from '../sim/notify'
import { alertsFor, Hud } from './Hud'
import { FoodPanel, HealthPanel, ProfilePanel, ShopPanel } from './panels'
import type { CatState } from '../sim/types'

type SheetId = 'food' | 'shop' | 'health' | 'profile' | null

export function Game({ cat }: { cat: CatState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<CatScene | null>(null)
  const [sheet, setSheet] = useState<SheetId>(null)
  const [toy, setToy] = useState(false)
  const [askNotif, setAskNotif] = useState(false)
  const [coatLabel, setCoatLabel] = useState('')
  const [loading, setLoading] = useState<{ stage: string; pct: number } | null>({ stage: 'Preparando', pct: 0 })
  const refresh = useGame((s) => s.refresh)
  const notify = useGame((s) => s.notify)
  const reset = useGame((s) => s.reset)
  const toast = useGame((s) => s.toast)
  useGame((s) => s.uiTick)

  // --- Cena 3D: criada uma vez por gato ---
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const scene = new CatScene(
      canvas,
      {
        getCat: () => useGame.getState().cat,
        getRuntime: () => useGame.getState().rt,
        onLoad: (stage, pct) => setLoading(pct >= 1 ? null : { stage, pct }),
        onTouch: (_region, hint) => {
          if (hint) useGame.getState().notify(hint)
          useGame.getState().refresh()
        },
      },
      cat.seed,
    )
    sceneRef.current = scene
    setCoatLabel(scene.coatLabel)
    scene.start()
    void scene.loadModel(new URL('models/cat.glb', document.baseURI).href)

    const onResize = () => scene.resize()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      scene.dispose()
      sceneRef.current = null
    }
  }, [cat.seed])

  // O convite para ativar avisos só aparece depois de o jogador se ambientar.
  useEffect(() => {
    const id = window.setTimeout(() => setAskNotif(canAskNotifications()), 45_000)
    return () => window.clearTimeout(id)
  }, [])

  // --- Relógio da interface: as barras se movem sozinhas ---
  useEffect(() => {
    const id = window.setInterval(() => {
      const c = useGame.getState().cat
      if (c) {
        const nowMs = Date.now()
        const bonus = dailyBonus(c, nowMs)
        if (bonus.ok) notify(bonus.message)
        checkNotifications(c, nowMs)
      }
      refresh()
    }, 1000)
    return () => window.clearInterval(id)
  }, [refresh, notify])

  const run = (fn: () => ActionResult) => {
    const res = fn()
    if (res.message) notify(res.message)
    refresh()
  }

  const toggleToy = () => {
    const next = !toy
    setToy(next)
    if (sceneRef.current) sceneRef.current.toyMode = next
    if (!next) sceneRef.current?.clearLure()
    else notify('Arraste o dedo pela sala para mexer a varinha.')
  }

  const now = Date.now()
  const rt = useGame.getState().rt
  const bubble = rt.say && now < rt.sayUntil ? rt.say : null
  const alerts = alertsFor(cat, now)
  const dirty = litterFilth(cat, now)

  return (
    <>
      <div className="stage">
        <canvas ref={canvasRef} />
      </div>

      <Hud cat={cat} now={now} />
      {bubble && <div className="bubble">{bubble}</div>}

      <div className="dock">
        <div className="dock-inner">
          <Act icon="🍽️" label="Comida" onClick={() => setSheet('food')} badge={cat.bowl.food <= 1 ? '!' : undefined} />
          <Act icon="💧" label="Água" onClick={() => run(() => fillWater(cat, Date.now()))} badge={cat.bowl.water <= 1 ? '!' : undefined} />
          <Act
            icon="🧹"
            label="Caixa"
            onClick={() => run(() => cleanLitter(cat, Date.now()))}
            badge={dirty > 0.55 ? '!' : undefined}
          />
          <Act icon="🪮" label="Escovar" onClick={() => run(() => brush(cat, Date.now()))} disabled={!has(cat, 'brush')} />
          <Act icon="🪶" label="Brincar" onClick={toggleToy} on={toy} disabled={!has(cat, 'wand')} />
          <Act icon="🐾" label="Bote" onClick={() => run(() => playSession(cat, Date.now()))} />
          <Act icon="🛒" label="Loja" onClick={() => setSheet('shop')} />
          <Act
            icon="🩺"
            label="Saúde"
            onClick={() => setSheet('health')}
            badge={cat.illnesses.length > 0 ? String(cat.illnesses.length) : undefined}
          />
          <Act icon="😺" label="Perfil" onClick={() => setSheet('profile')} badge={alerts.length > 0 ? undefined : undefined} />
        </div>
      </div>

      {sheet === 'food' && <FoodPanel cat={cat} now={now} run={run} onClose={() => setSheet(null)} />}
      {sheet === 'shop' && <ShopPanel cat={cat} run={run} onClose={() => setSheet(null)} />}
      {sheet === 'health' && <HealthPanel cat={cat} now={now} run={run} onClose={() => setSheet(null)} />}
      {sheet === 'profile' && (
        <ProfilePanel
          cat={cat}
          now={now}
          coatLabel={coatLabel}
          onReset={() => {
            setSheet(null)
            reset()
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {askNotif && (
        <div className="notif-ask">
          <div className="notif-text">
            Quer que eu avise quando o pote ou a caixa precisarem de você?
            <span className="notif-fine">Nunca aviso sobre a saúde dele — isso é com você.</span>
          </div>
          <div className="notif-actions">
            <button className="btn ghost" onClick={() => setAskNotif(false)}>Agora não</button>
            <button
              className="btn"
              onClick={async () => {
                await askNotifications()
                setAskNotif(false)
              }}
            >
              Avisar
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="loading-card">
            <div className="loading-title">{loading.stage}…</div>
            <div className="loading-track">
              <div className="loading-fill" style={{ width: `${Math.round(loading.pct * 100)}%` }} />
            </div>
            <div className="loading-hint">
              O gato está sendo montado osso por osso. Só acontece uma vez.
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}

function Act({
  icon,
  label,
  onClick,
  disabled,
  on,
  badge,
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
  on?: boolean
  badge?: string
}) {
  return (
    <button className="act" onClick={onClick} disabled={disabled} data-on={on ? 'true' : 'false'}>
      <span className="act-icon">{icon}</span>
      <span className="act-label">{label}</span>
      {badge && <span className="act-badge">{badge}</span>}
    </button>
  )
}
