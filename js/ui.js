// Camada de interface: leitura corporal, avisos, painéis e barras.
import { clamp, humanDur } from './util.js';
import { ageDays, urgentNeed, foodFreshness, waterQuality, FOOD } from './state.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(state, hooks) {
    this.s = state;
    this.hooks = hooks;
    this.lastRead = '';
    this.toastT = 0;
    this.readT = 0;

    this.el = {
      read: $('read'), mood: $('readMood'), body: $('readBody'),
      toast: $('toast'), clock: $('clockTxt'), dot: $('alertDot'),
      bars: $('bars'), bondNote: $('bondNote'),
      catName: $('catName'), catAge: $('catAge'), bowlInfo: $('bowlInfo'),
      playHud: $('playHud'), playTip: $('playTip'),
    };

    for (const b of document.querySelectorAll('.act')) {
      b.addEventListener('click', () => hooks.action(b.dataset.act));
    }
    for (const b of document.querySelectorAll('[data-food]')) {
      b.addEventListener('click', () => { this.close('foodSheet'); hooks.feed(b.dataset.food); });
    }
    for (const b of document.querySelectorAll('[data-close]')) {
      b.addEventListener('click', () => b.closest('.sheet').classList.add('hidden'));
    }
    $('statsBtn').addEventListener('click', () => this.openStats());
    $('playStop').addEventListener('click', () => hooks.action('play'));
    $('introGo').addEventListener('click', () => {
      const v = $('nameInput').value.trim();
      this.s.name = v || 'Misha';
      this.close('intro');
      hooks.introDone();
    });
  }

  open(id) { $(id).classList.remove('hidden'); }
  close(id) { $(id).classList.add('hidden'); }

  toast(text) {
    if (!text) return;
    this.el.toast.textContent = text;
    this.el.toast.classList.add('on');
    this.toastT = 4.6;
  }

  setRead(r) {
    const key = r.mood + '|' + r.body;
    if (key === this.lastRead) return;
    this.lastRead = key;
    this.el.mood.textContent = r.mood;
    this.el.body.textContent = r.body;
    this.el.read.classList.add('on');
    this.readT = 7;
  }

  playMode(on, tip) {
    this.el.playHud.classList.toggle('hidden', !on);
    document.querySelector('[data-act="play"]').classList.toggle('armed', on);
    if (tip) this.el.playTip.textContent = tip;
  }

  tick(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('on'); }
    if (this.readT > 0) { this.readT -= dt; if (this.readT <= 0) this.el.read.classList.remove('on'); }

    const d = new Date();
    this.el.clock.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    this.el.dot.classList.toggle('on', !!urgentNeed(this.s));
  }

  openFood() {
    const s = this.s;
    const f = foodFreshness(s);
    this.el.bowlInfo.textContent = !s.bowl.type
      ? 'A tigela está vazia.'
      : f <= 0
        ? 'Tem comida estragada na tigela. Ele não vai encostar — troque.'
        : `Ainda tem ${Math.round(s.bowl.amount * 100)}% de ${s.bowl.type === 'dry' ? 'ração' : s.bowl.type === 'wet' ? 'sachê' : 'petisco'} na tigela.`;
    const left = 3 - s.treats.count;
    const tb = document.querySelector('[data-food="treat"]');
    tb.querySelector('small').textContent = left > 0
      ? `Constrói confiança. ${left} com valor real hoje.`
      : 'Já foram muitos hoje — perdeu a graça.';
    this.open('foodSheet');
  }

  openStats() {
    const s = this.s;
    this.el.catName.textContent = s.name;
    const days = ageDays(s);
    this.el.catAge.textContent = days < 1
      ? 'Com você há menos de um dia.'
      : `Com você há ${Math.floor(days)} dia${days >= 2 ? 's' : ''}.`;

    const rows = [
      ['Fome', s.needs.hunger, true, 'Come pouco e várias vezes ao dia.'],
      ['Sede', s.needs.thirst, true, `Água ${waterQuality(s) > 0.5 ? 'fresca' : waterQuality(s) > 0.15 ? 'velha' : 'imprópria'}.`],
      ['Bexiga', s.needs.bladder, true, 'Ele só usa caixa limpa.'],
      ['Energia', s.needs.energy, false, 'Dorme ~16h por dia, em blocos.'],
      ['Tédio', s.needs.stim, true, 'Instinto de caça sem uso vira bagunça.'],
      ['Carinho', s.needs.social, true, 'No tempo dele, não no seu.'],
      ['Caixa de areia', s.litter.soil * 100, true, 'Suja demais e ele para de usar.'],
      ['Nós no pelo', s.coat.mats * 100, true, 'Escovar evita bola de pelo.'],
      ['Estresse', s.stress, true, 'Estresse alto vira doença.'],
      ['Saúde', s.health, false, 'Só cai com descuido prolongado.'],
      ['Confiança', s.bond, false, 'Sobe em semanas. Cai em um susto.'],
    ];
    this.el.bars.innerHTML = rows.map(([label, v, bad, note]) => {
      const pct = clamp(v, 0, 100);
      const good = bad ? 100 - pct : pct;
      const col = good > 66 ? '#7fb98a' : good > 33 ? '#e8a06a' : '#e2685f';
      return `<div class="bar-row">
        <div class="bar-top"><span>${label}</span><span>${note}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div>
      </div>`;
    }).join('');

    const b = s.bond;
    this.el.bondNote.textContent =
      b < 15 ? `${s.name} ainda está te avaliando. Rotina previsível vale mais que carinho forçado.`
      : b < 40 ? `${s.name} já te reconhece. Ainda decide quando quer chegar perto.`
      : b < 70 ? `${s.name} confia em você. Vem quando chama — às vezes.`
      : `${s.name} escolheu você. Ele dorme perto e pisca devagar quando te vê.`;
    this.open('statsSheet');
  }

  awayReport(rep, s) {
    if (!rep || rep.hours < 0.5) return null;
    const t = humanDur(rep.hours * 3600000);
    const bits = [];
    if (rep.ate) bits.push(`comeu ${rep.ate}x do que estava na tigela`);
    if (rep.drank) bits.push(`bebeu água ${rep.drank}x`);
    if (rep.litter) bits.push(`usou a caixa ${rep.litter}x`);
    if (rep.accidents) bits.push(`fez ${rep.accidents}x fora da caixa`);
    if (rep.hairballs) bits.push('vomitou bola de pelo');
    const dorm = rep.slept > 0.5 ? `dormiu ${Math.round(rep.slept)}h` : null;
    if (dorm) bits.unshift(dorm);
    const head = rep.hours > 24
      ? `Você sumiu por ${t}.`
      : `Passaram ${t} desde a última vez.`;
    return bits.length ? `${head} ${s.name} ${bits.join(', ')}.` : head;
  }
}
