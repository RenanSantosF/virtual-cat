/** Modelo de dados da simulação. Tudo em unidades reais: ms epoch, kg, segundos. */

export type LifeStage = 'kitten' | 'junior' | 'adult' | 'mature' | 'senior'

/** Necessidades em 0..100, onde 100 = plenamente satisfeita. */
export interface Needs {
  /** Saciedade. 0 = faminto. */
  hunger: number
  /** Hidratação. 0 = desidratado. */
  thirst: number
  /** Descanso. 0 = exausto. */
  energy: number
  /** Alívio da bexiga/intestino. 0 = precisa urgentemente da caixa. */
  bladder: number
  /** Limpeza da própria pelagem. */
  hygiene: number
  /** Vínculo social recente. Cai se o gato é ignorado por dias. */
  affection: number
  /** Estímulo mental / instinto de caça. 0 = entediado. */
  stimulation: number
}

export type NeedKey = keyof Needs

/** Traços de temperamento, 0..1. Sorteados no nascimento — cada gato é único. */
export interface Personality {
  /** Procura contato humano por conta própria. */
  sociability: number
  /** Intensidade e frequência de surtos de energia (zoomies). */
  energy: number
  /** Tendência a se assustar e fugir. */
  timidity: number
  /** Interesse por comida além da fome. */
  gluttony: number
  /** Vontade de investigar coisas novas. */
  curiosity: number
  /** O quanto mia. */
  vocality: number
  /** Tolerância a ser manipulado antes de se irritar. */
  independence: number
}

export type IllnessKind =
  | 'dehydration'
  | 'hairball'
  | 'worms'
  | 'uti'
  | 'cold'
  | 'indigestion'

export interface Illness {
  kind: IllnessKind
  /** Quando começou (ms epoch). */
  since: number
  /** 0..1 — piora sozinha se não tratada. */
  severity: number
}

export type FoodKind = 'kibble' | 'wet' | 'treat' | 'kittenFormula'

export interface Bowl {
  /** Gramas de ração no pote. */
  food: number
  foodKind: FoodKind
  /** Quando a comida foi servida — ração úmida estraga. */
  servedAt: number
  /** Mililitros de água. */
  water: number
  waterFilledAt: number
}

export interface LitterBox {
  /** Número de usos desde a última limpeza. */
  uses: number
  lastCleaned: number
}

export type ItemId =
  | 'kibble'
  | 'wet'
  | 'treat'
  | 'kittenFormula'
  | 'litter'
  | 'dewormer'
  | 'coldMedicine'
  | 'hairballPaste'
  | 'brush'
  | 'wand'
  | 'ball'

export interface Inventory {
  coins: number
  items: Partial<Record<ItemId, number>>
}

export type BehaviorId =
  | 'sleep'
  | 'doze'
  | 'idle'
  | 'sit'
  | 'walk'
  | 'run'
  | 'stretch'
  | 'groom'
  | 'eat'
  | 'drink'
  | 'litter'
  | 'play'
  | 'stalk'
  | 'pounce'
  | 'knead'
  | 'rub'
  | 'watch'
  | 'meow'
  | 'hide'
  | 'purr'

export interface CatState {
  version: number
  name: string
  /** Semente determinística — define personalidade e pelagem. */
  seed: number
  /** ms epoch do "nascimento". A idade real é derivada disso. */
  birth: number
  /** Último instante simulado (ms epoch). */
  lastTick: number

  personality: Personality
  needs: Needs
  /** 0..100. Degrada com necessidades cronicamente ignoradas. */
  health: number
  /** 0..100. Sobe com manuseio excessivo, fome, sujeira, barulho. */
  stress: number
  /** 0..100. A confiança acumulada no dono. Sobe devagar, cai rápido. */
  bond: number

  illnesses: Illness[]
  /** ms epoch da última vermifugação/vacina. */
  lastVetVisit: number

  bowl: Bowl
  litter: LitterBox
  inventory: Inventory

  /** Comportamento atual e quando começou. */
  behavior: BehaviorId
  behaviorSince: number
  /** Posição no chão, em metros, relativa ao centro do cômodo. */
  pos: [number, number]
  /** Alvo de deslocamento atual. */
  target: [number, number] | null
  /** Direção que o gato encara, radianos. */
  facing: number

  /** Estatísticas para a economia e o vínculo. */
  stats: {
    meals: number
    plays: number
    pets: number
    vetVisits: number
    daysCaredFor: number
    lastDailyBonus: number
  }
}
