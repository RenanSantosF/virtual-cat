// O cérebro. Escolhe o que fazer por utilidade, não por script: cada ação
// concorre com as outras e vence a mais urgente para o estado atual do bicho.
// É aqui que mora a parte chata e boa de ter um gato de verdade.
import { clamp, lerp, rand, randInt, chance, pick, approach } from './util.js';
import { SPOTS, ROOM } from './world.js';
import * as A from './audio.js';
import {
  activityDrive, foodAppeal, foodFreshness, waterQuality,
  eatFromBowl, drinkWater, useLitter, accident, FOOD,
} from './state.js';

const YOU = { you: true };

export class Brain {
  constructor(cat, s) {
    this.cat = cat;
    this.s = s;
    this.act = 'idle';
    this.phase = 0;
    this.t = 0;
    this.speed = 0;
    this.target = null;
    this.look = null;
    this.msgs = [];

    this.overstim = 0;
    this.petting = null;
    this.consent = 0;
    this.warned = false;

    this.toy = null;
    this.interest = 0;
    this.catchDebt = 0;
    this.boredom = 0;
    this.lastToyDir = 0;
    this.dirChanges = 0;

    this.callTimes = [];
    this.rejected = 0;
    this.since = {};
    this.read = { mood: '—', body: '' };
    this.pendingSit = 0;
  }

  say(text) { this.msgs.push(text); }
  popMsg() { return this.msgs.shift(); }

  /* ---------------------------------------------------- utilidades */
  // Cada candidato devolve uma pontuação; a maior leva. Empates viram variação.
  choose() {
    const s = this.s, n = s.needs;
    const drive = activityDrive();
    const now = Date.now();
    const food = foodAppeal(s, now);
    const water = waterQuality(s, now);
    const sleepy = clamp((lerp(80, 28, drive) - n.energy) / 40);

    const c = {
      sleep: sleepy * 90 + (s.stress > 70 ? 10 : 0),
      eat: n.hunger > 38 && food > 0.2 ? (n.hunger - 30) * 1.5 * lerp(0.5, 1.25, food) : 0,
      drink: n.thirst > 45 && water > 0.15 ? (n.thirst - 40) * 1.2 : 0,
      litter: n.bladder > 68 ? (n.bladder - 60) * 2.2 : 0,
      demandFood: n.hunger > 62 && food <= 0.2 ? (n.hunger - 55) * 1.9 : 0,
      rejectFood: n.hunger > 45 && s.bowl.type && food <= 0.05 ? 46 : 0,
      complainLitter: n.bladder > 66 && s.litter.soil > 0.88 ? 88 : 0,
      hairball: s.coat.hairball > 0.9 ? 70 : 0,
      groom: 16 + (this.since.eat < 40 ? 46 : 0) + (s.coat.mats > 0.6 ? 18 : 0),
      zoomies: n.stim > 62 && n.energy > 55 ? (n.stim - 55) * 1.5 * lerp(0.4, 1.7, drive) : 0,
      hunt: n.stim > 45 && n.energy > 35 ? (n.stim - 40) * 1.1 * lerp(0.5, 1.4, drive) : 0,
      scratch: n.stim > 40 ? 18 + n.stim * 0.2 : 8,
      window: 24 * lerp(0.4, 1.5, drive) + (n.stim > 50 ? 14 : 0),
      greet: n.social > 55 && s.bond > 28 ? (n.social - 45) * 1.3 * (s.bond / 100) : 0,
      attention: n.social > 70 && s.bond > 12 ? (n.social - 60) * 1.1 : 0,
      knead: s.bond > 62 && s.stress < 30 && n.energy < 60 ? 26 : 0,
      hide: s.stress > 72 ? (s.stress - 65) * 2.4 : 0,
      idle: 22 + rand(0, 14),
    };
    // não repete a mesma coisa duas vezes seguidas sem motivo
    if (c[this.act] !== undefined) c[this.act] *= 0.45;
    let best = 'idle', bv = -1;
    for (const k in c) if (c[k] > bv) { bv = c[k]; best = k; }
    return best;
  }

  start(act) {
    this.act = act;
    this.phase = 0;
    this.t = 0;
    this.target = null;
    const cat = this.cat, s = this.s;
    cat.pt.tailFlick = 0;
    cat.pt.tailPuff = 0;
    cat.pt.earRot = 0;
    cat.pt.squint = 0;
    cat.pt.mouthOpen = 0;
    cat.pt.purr = 0;

    switch (act) {
      case 'sleep': this.target = pick([SPOTS.bed, SPOTS.bed, SPOTS.box, SPOTS.window + 90]); break;
      case 'eat': case 'rejectFood': case 'demandFood': this.target = SPOTS.bowl; break;
      case 'drink': this.target = SPOTS.water; break;
      case 'litter': case 'complainLitter': this.target = SPOTS.litter; break;
      case 'window': this.target = SPOTS.window + 40; break;
      case 'scratch': this.target = SPOTS.post - 60; break;
      case 'knead': this.target = SPOTS.bed; break;
      case 'hide': this.target = SPOTS.box; break;
      case 'greet': case 'attention': this.target = clamp(this.cat.x + rand(-120, 120), 240, 700); break;
      case 'zoomies': this.zoomLeft = randInt(4, 7); this.target = rand(80, 900); break;
      case 'hunt': this.prey = { x: clamp(cat.x + rand(-260, 260), 70, 930), y: ROOM.ground - rand(0, 16) }; break;
      case 'play': this.interest = 0.75; break;
    }
  }

  /* --------------------------------------------------- ações do jogador */
  request(kind, data = {}) {
    const cat = this.cat, s = this.s;
    switch (kind) {
      case 'call': return this.onCall();
      case 'playStart':
        if (this.act === 'sleep') { this.wake(0.5); }
        this.start('play');
        return;
      case 'playEnd':
        this.toy = null;
        if (this.act === 'play') this.start('idle');
        return;
      case 'petStart': return this.onPetStart(data.zone);
      case 'petEnd': return this.onPetEnd();
      case 'brush': return this.onBrush();
      case 'fed': return this.onFed(data.type);
      case 'water': this.say('Água fresca. Ele nota isso mais do que você imagina.'); return;
      case 'litterClean':
        this.say('Caixa limpa. Gato não usa banheiro sujo — ele segura, e isso adoece.');
        s.stress = clamp(s.stress - 6, 0, 100);
        return;
      case 'wake': return this.wake(1);
    }
  }

  onCall() {
    const s = this.s, cat = this.cat, now = Date.now();
    this.callTimes = this.callTimes.filter(t => now - t < 60000);
    this.callTimes.push(now);
    A.ready();

    if (this.act === 'sleep') {
      // Chamar gato dormindo não acorda gato dormindo. Só a orelha responde.
      cat.p.earTwitch = 1;
      this.say(`${s.name} mexe a orelha e continua dormindo.`);
      if (this.callTimes.length > 2) {
        this.wake(0.6);
        s.bond = clamp(s.bond - 1.5, 0, 100);
        s.stress = clamp(s.stress + 8, 0, 100);
        this.say('Você acordou ele. Ele registrou.');
      }
      return;
    }
    if (this.callTimes.length > 3) {
      s.bond = clamp(s.bond - 1, 0, 100);
      cat.pt.earRot = 0.7;
      this.say('Chamar de novo e de novo não faz ele vir. Faz ele te evitar.');
      return;
    }

    this.look = YOU;
    // Vir ou não é decisão dele: vínculo, humor e o que ele ganha com isso.
    const p = clamp(s.bond / 140 + (s.needs.social - 40) / 180 + (s.needs.hunger > 55 ? 0.28 : 0)
                    - s.stress / 200 - (this.act === 'eat' || this.act === 'groom' ? 0.35 : 0));
    if (chance(p)) {
      this.start('greet');
      this.say(`${s.name} veio. Isso foi escolha dele.`);
    } else {
      cat.p.earTwitch = 1;
      this.say(chance(0.5)
        ? `${s.name} olha para você e não se move.`
        : `Orelha girou na sua direção. O resto do gato, não.`);
      if (chance(0.35)) A.meow('meow', 0.3);
    }
  }

  onFed(type) {
    const s = this.s;
    if (type === 'treat') {
      s.treats.count++;
      const worth = clamp(1 - (s.treats.count - 1) * 0.28);
      s.bond = clamp(s.bond + 2.4 * worth, 0, 100);
      if (worth < 0.5) this.say('Petisco demais no mesmo dia deixa de ser especial.');
    }
    if (this.act === 'sleep' && s.needs.hunger > 45) this.wake(0.8);
    if (s.needs.hunger > 30) { this.start('eat'); }
    else this.say(`${s.name} olhou a tigela e não se levantou. Ele não está com fome.`);
  }

  onBrush() {
    const s = this.s, cat = this.cat;
    if (this.act === 'sleep') { this.wake(0.7); s.stress = clamp(s.stress + 4, 0, 100); }
    s.coat.mats = clamp(s.coat.mats - 0.45, 0, 1);
    s.coat.hairball = clamp(s.coat.hairball - 0.3, 0, 1);
    if (s.stress < 55) {
      s.bond = clamp(s.bond + 0.8, 0, 100);
      s.stress = clamp(s.stress - 7, 0, 100);
      cat.pt.purr = 1; cat.pt.squint = 0.8;
      A.purr(true, 0.9);
      this.say('Ele encosta a cabeça na escova. Nó desfeito é bola de pelo que não vem.');
      this.purrUntil = this.now + 6;
    } else {
      cat.pt.earRot = 0.6;
      this.say('Ele aceita a escova de má vontade. Está estressado demais para isso.');
    }
  }

  onPetStart(zone) {
    const s = this.s, cat = this.cat;
    A.ready();
    this.petting = zone;
    this.warned = false;

    if (this.act === 'sleep') {
      this.wake(0.9);
      s.stress = clamp(s.stress + 10, 0, 100);
      s.bond = clamp(s.bond - 2, 0, 100);
      this.say('Você acordou ele com a mão. Gato não gosta de ser acordado assim.');
      this.consent = 0;
      return;
    }
    if (this.act === 'eat') {
      this.consent = 0.2;
      this.say('Mexer com gato comendo é pedir para ele parar de comer.');
      return;
    }

    // Zona importa: cabeça e bochecha são convite, barriga e base do rabo são armadilha.
    const zoneOK = { head: 1, shoulder: 0.85, back: 0.6, rump: 0.35, tail: 0.1 }[zone] ?? 0.5;
    this.consent = clamp(zoneOK * (0.45 + s.bond / 130) * (1 - s.stress / 130));
    this.overstimRate = { head: 0.055, shoulder: 0.07, back: 0.1, rump: 0.2, tail: 0.42 }[zone] ?? 0.1;

    if (this.consent > 0.45) {
      cat.pt.squint = 0.75; cat.pt.purr = 1; cat.pt.earRot = 0;
      A.purr(true, clamp(this.consent));
      s.needs.social = clamp(s.needs.social - 14, 0, 100);
    } else {
      cat.pt.earRot = 0.55; cat.pt.pupil = 0.8;
      this.say(zone === 'tail' || zone === 'rump'
        ? 'Base do rabo. Alguns gostam por dois segundos. Depois disso, não.'
        : 'Ele não pediu carinho agora.');
    }
  }

  onPetEnd() {
    const cat = this.cat, s = this.s;
    const wasPetting = this.petting;
    this.petting = null;
    A.purr(false);
    cat.pt.purr = 0; cat.pt.squint = 0;
    if (!wasPetting) return;
    // Parar ANTES do limite é o que constrói confiança. Passar dele custa caro.
    if (this.consent > 0.45 && this.overstim > 0.25 && this.overstim < 0.85) {
      s.bond = clamp(s.bond + 1.6, 0, 100);
      s.stress = clamp(s.stress - 5, 0, 100);
      s.log.pets++;
      this.say('Você parou na hora certa. É assim que se ganha um gato.');
    }
    this.overstim = Math.max(0, this.overstim - 0.3);
  }

  wake(force = 1) {
    if (this.act !== 'sleep' && this.act !== 'drowse') return;
    this.s.asleep = false;
    this.start(force > 0.7 ? 'wakeUp' : 'drowse');
  }

  slowBlinkFromYou() {
    const cat = this.cat, s = this.s;
    // Piscar devagar é o "eu confio em você" do gato. Só conta se ele te vê.
    const looking = this.look === YOU || this.act === 'attention' || this.act === 'idle';
    if (this.act === 'sleep') { this.say('Ele está dormindo. Não viu.'); return; }
    if (!looking || cat.p.eyeOpen < 0.4) { this.say('Ele não estava olhando.'); return; }
    this.look = YOU;
    setTimeout(() => {
      cat.doSlowBlink();
      s.bond = clamp(s.bond + 1.2, 0, 100);
      s.stress = clamp(s.stress - 4, 0, 100);
      s.log.blinks++;
      this.say('Ele piscou devagar de volta. Isso é um gato dizendo que está tudo bem.');
    }, 700);
  }

  /* --------------------------------------------------------- tique */
  update(dt, env) {
    const cat = this.cat, s = this.s;
    this.t += dt;
    this.now = env.now;
    for (const k in this.since) this.since[k] += dt;
    this.speed = 0;

    const drive = activityDrive();
    // Pupila responde à luz e à adrenalina, como pupila de verdade.
    cat.pt.pupil = clamp(0.15 + (1 - env.light) * 0.75 + cat.pt.arousal * 0.35);
    cat.pt.breath = this.act === 'sleep' ? 0.32 : lerp(0.55, 1.9, clamp(this.speed / 200 + cat.pt.arousal * 0.4));

    this.tickPetting(dt);
    this.tickAct(dt, env, drive);
    this.tickLook(dt);
    this.updateRead(drive);

    // caminhar até o alvo
    if (this.target != null) {
      const d = this.target - cat.x;
      if (Math.abs(d) > 8) {
        cat.facing = d > 0 ? 1 : -1;
        this.speed = this.speed || (this.act === 'zoomies' ? 300 : this.act === 'play' ? 150 : 62);
      } else if (this.speed === 0) {
        this.arrived = true;
      }
    }
    cat.x = clamp(cat.x, 60, ROOM.w - 60);
  }

  atTarget() { return this.target == null || Math.abs(this.target - this.cat.x) <= 10; }

  tickLook(dt) {
    const cat = this.cat;
    if (!this.look) {
      cat.pt.headTurn = approach(cat.pt.headTurn, 0.1, 2, dt);
      cat.pt.headX = 0; cat.pt.headY = 0;
      return;
    }
    if (this.look === YOU) {
      cat.pt.headTurn = 1;
      cat.pt.headX = 0; cat.pt.headY = 2;
      return;
    }
    const h = cat.headWorld();
    const dx = (this.look.x - h.x) * cat.facing, dy = this.look.y - h.y;
    const d = Math.hypot(dx, dy) || 1;
    cat.pt.headTurn = clamp(0.9 - Math.abs(dx) / 200, -0.2, 1);
    cat.pt.headX = clamp(dx / d * 14, -16, 18);
    cat.pt.headY = clamp(dy / d * 16, -20, 22);
    cat.pt.headTilt = clamp(dy / 400, -0.22, 0.3);
  }

  tickPetting(dt) {
    if (!this.petting) { this.overstim = Math.max(0, this.overstim - dt * 0.25); return; }
    const cat = this.cat, s = this.s;
    if (this.consent <= 0.45) {
      this.overstim = clamp(this.overstim + dt * 0.5);
    } else {
      this.overstim = clamp(this.overstim + dt * (this.overstimRate ?? 0.1));
      cat.pt.purr = 1;
    }
    // O aviso vem antes da mordida — e vem sempre. Só depende de você ler.
    if (this.overstim > 0.55) {
      cat.pt.tailFlick = clamp((this.overstim - 0.5) * 2.4);
      cat.pt.earRot = clamp((this.overstim - 0.5) * 1.6);
      cat.pt.pupil = clamp(0.4 + this.overstim * 0.6);
      cat.pt.squint = 0;
      cat.pt.purr = 0;
      if (!this.warned) {
        this.warned = true;
        A.purr(false);
        this.say('Rabo batendo, orelha girando. Ele está avisando. Solte.');
      }
    }
    if (this.overstim >= 1) this.bite();
  }

  bite() {
    const cat = this.cat, s = this.s;
    this.petting = null;
    this.overstim = 0;
    A.purr(false);
    A.meow('hiss');
    s.bond = clamp(s.bond - 5, 0, 100);
    s.stress = clamp(s.stress + 22, 0, 100);
    s.log.bites++;
    cat.pt.earRot = 1; cat.pt.pupil = 1; cat.pt.mouthOpen = 1;
    this.say('Ele mordeu e saiu. O aviso estava lá.');
    this.start('hide');
    setTimeout(() => { cat.pt.mouthOpen = 0; }, 500);
  }

  /* ------------------------------------------------ máquina de ações */
  tickAct(dt, env, drive) {
    const cat = this.cat, s = this.s;
    const P = this.phase;

    switch (this.act) {

      case 'idle': {
        cat.setPose(this.t > 6 ? 'loaf' : 'sit');
        cat.pt.eyeOpen = 1;
        if (this.t > 1 && chance(dt * 0.5)) {
          this.look = chance(0.35) ? YOU : { x: cat.x + rand(-300, 300), y: ROOM.ground - rand(0, 260) };
        }
        if (this.t > rand(6, 14)) this.start(this.choose());
        break;
      }

      case 'sleep': {
        s.asleep = true;
        if (!this.atTarget()) { cat.setPose('stand'); break; }
        this.speed = 0;
        cat.setPose(env.light < 0.5 || s.stress > 40 ? 'curl' : 'side');
        cat.pt.eyeOpen = 0; cat.pt.earRot = 0.12; cat.pt.tailCurl = 1;
        this.look = null;
        // sonho: patinha treme, orelha mexe
        if (chance(dt * 0.25)) cat.p.earTwitch = 1;
        if (chance(dt * 0.08)) cat.pt.headTilt = rand(-0.1, 0.1);
        const sleepy = clamp((lerp(80, 28, drive) - s.needs.energy) / 40);
        if (sleepy < 0.05 || s.needs.hunger > 84 || s.needs.bladder > 88) this.start('wakeUp');
        break;
      }

      case 'drowse': {
        cat.setPose('loaf');
        cat.pt.eyeOpen = 0.35; cat.pt.squint = 0.4;
        if (this.t > rand(8, 20)) this.start(s.needs.energy < 40 ? 'sleep' : this.choose());
        break;
      }

      case 'wakeUp': {
        s.asleep = false;
        if (P === 0) { cat.setPose('loaf'); cat.pt.eyeOpen = 0.5; if (this.t > 1.4) { this.phase = 1; this.t = 0; } }
        else if (P === 1) {                       // espreguiçar de verdade vem antes de tudo
          cat.setPose('stretch'); cat.pt.eyeOpen = 0.2; cat.pt.mouthOpen = clamp(Math.sin(this.t * 2) * 1.4);
          if (this.t > 1.8) { this.phase = 2; this.t = 0; cat.pt.mouthOpen = 0; A.thud(0.08); }
        } else { cat.setPose('sit'); cat.pt.eyeOpen = 1; if (this.t > 1) this.start(this.choose()); }
        break;
      }

      case 'eat': {
        this.look = { x: SPOTS.bowl, y: ROOM.ground - 20 };
        if (!this.atTarget()) { cat.setPose('stand'); break; }
        cat.facing = -1;
        cat.setPose('crouch');
        cat.pt.headY = 34; cat.pt.headX = 6; cat.pt.headTurn = -0.1;
        cat.pt.mouthOpen = 0.35 + Math.sin(this.t * 9) * 0.3;
        if (P === 0) {
          if (foodAppeal(s, this.now) <= 0.05) { this.start('rejectFood'); break; }
          if (chance(dt * 3)) A.crunch();
          if (this.t > 3.2) {
            eatFromBowl(s, this.now);
            this.since.eat = 0;
            this.phase = 1; this.t = 0;
          }
        } else {
          cat.pt.mouthOpen = 0;
          if (this.t > 0.8) this.start(s.needs.hunger > 40 && foodAppeal(s, this.now) > 0.2 ? 'eat' : 'groom');
        }
        break;
      }

      case 'rejectFood': {
        if (!this.atTarget()) { cat.setPose('stand'); break; }
        if (P === 0) {
          cat.facing = -1; cat.setPose('crouch');
          cat.pt.headY = 30; cat.pt.headTurn = -0.2;
          if (this.t > 1.6) { this.phase = 1; this.t = 0; cat.pt.headY = 0; }
        } else if (P === 1) {
          cat.setPose('sit'); this.look = YOU; cat.pt.earRot = 0.35;
          if (this.t < 0.2) {
            A.meow('meow', 0.2);
            const why = s.bowl.type === 'wet' ? 'A comida azedou.' : 'Isso já está velho.';
            this.say(`${why} Ele cheirou, olhou para você e não comeu.`);
          }
          if (this.t > 3) this.start('idle');
        }
        break;
      }

      case 'drink': {
        this.look = { x: SPOTS.water, y: ROOM.ground - 20 };
        if (!this.atTarget()) { cat.setPose('stand'); break; }
        cat.facing = -1; cat.setPose('crouch');
        cat.pt.headY = 32; cat.pt.headTurn = -0.1;
        if (P === 0 && this.t > 0.6) { A.lap(); this.phase = 1; }
        if (this.t > 3) { drinkWater(s, this.now); this.start('idle'); }
        break;
      }

      case 'litter': {
        if (!this.atTarget()) { cat.setPose('stand'); break; }
        cat.facing = 1;
        if (P === 0) {                            // cavar antes
          cat.setPose('crouch'); cat.pt.headY = 26;
          this.speed = 0;
          if (this.t > 1.6) { this.phase = 1; this.t = 0; cat.pt.headY = 0; }
        } else if (P === 1) {
          cat.setPose('sit'); cat.pt.eyeOpen = 0.5; cat.pt.squint = 0.3;
          this.look = null;
          if (this.t > 3) {
            if (!useLitter(s)) { this.start('complainLitter'); break; }
            this.phase = 2; this.t = 0;
          }
        } else {                                   // e cobrir depois
          cat.setPose('crouch'); cat.pt.headY = 22;
          if (this.t > 2) this.start('groom');
        }
        break;
      }

      case 'complainLitter': {
        if (!this.atTarget()) { cat.setPose('stand'); break; }
        cat.setPose('sit'); this.look = YOU; cat.pt.earRot = 0.4; cat.pt.tailFlick = 0.5;
        if (this.t < 0.2) {
          A.meow('yowl', 0.2);
          this.say('A caixa está imunda. Ele está segurando — e isso vira problema de saúde.');
        }
        if (this.t > 4) {
          if (s.needs.bladder > 95) {
            accident(s);
            this.say('Ele não aguentou e fez fora da caixa. A culpa é da caixa.');
            this.start('hide');
          } else this.start('idle');
        }
        break;
      }

      case 'demandFood': {
        this.look = YOU;
        if (!this.atTarget()) { cat.setPose('stand'); break; }
        cat.setPose('sit');
        cat.pt.tailA = 1.4; cat.pt.tailCurl = 1.3;
        if (P === 0) {
          A.meow(s.needs.hunger > 82 ? 'yowl' : 'meow', 0.7);
          this.say(s.needs.hunger > 85
            ? `${s.name} está com fome de verdade. Não é manha.`
            : `${s.name} está pedindo comida, sentado na tigela vazia.`);
          this.phase = 1; this.t = 0;
        }
        if (this.t > rand(3, 6)) {
          if (s.needs.hunger > 62 && chance(0.6)) { this.phase = 0; this.t = 0; }
          else this.start('idle');
        }
        break;
      }

      case 'groom': {
        cat.setPose('sit');
        this.look = null;
        const part = this.groomPart ?? (this.groomPart = pick(['flank', 'paw', 'chest']));
        cat.pt.headTurn = -0.3;
        cat.pt.headY = part === 'paw' ? 12 : 26;
        cat.pt.headX = part === 'flank' ? -18 : -4;
        cat.pt.headTilt = Math.sin(this.t * 6) * 0.12 + (part === 'flank' ? 0.5 : 0.2);
        cat.pt.mouthOpen = 0.12 + Math.sin(this.t * 6) * 0.1;
        s.coat.hairball = clamp(s.coat.hairball + dt * 0.004, 0, 1);
        if (this.t > rand(5, 11)) { this.groomPart = null; this.start(this.choose()); }
        break;
      }

      case 'hairball': {
        cat.setPose('crouch');
        this.look = null;
        cat.pt.headY = 20 + Math.sin(this.t * 7) * 12;
        cat.pt.mouthOpen = 0.5 + Math.sin(this.t * 7) * 0.5;
        cat.pt.earRot = 0.4;
        if (P === 0 && this.t > 2.6) {
          this.phase = 1;
          s.coat.hairball = rand(0.05, 0.15);
          s.log.hairballs++;
          s.stress = clamp(s.stress + 5, 0, 100);
          A.meow('hiss');
          this.say('Bola de pelo. Escovar com frequência evita isso.');
        }
        if (this.t > 4) this.start('groom');
        break;
      }

      case 'zoomies': {
        cat.setPose('stand');
        this.speed = 300;
        cat.pt.pupil = 1; cat.pt.arousal = 1; cat.pt.tailA = 1.2; cat.pt.earRot = 0.15;
        s.needs.stim = clamp(s.needs.stim - dt * 9, 0, 100);
        if (this.atTarget()) {
          if (--this.zoomLeft <= 0) { this.start('idle'); break; }
          this.target = this.target > ROOM.w / 2 ? rand(70, 260) : rand(740, 930);
          A.thud(0.12);
        }
        break;
      }

      case 'hunt': {
        // Sequência predatória: fixar → espreitar → rebolar → dar o bote.
        const prey = this.prey;
        this.look = prey;
        const dx = prey.x - cat.x;
        cat.facing = dx > 0 ? 1 : -1;
        if (P === 0) {
          cat.setPose('crouch'); this.speed = 0;
          cat.pt.pupil = 0.95; cat.pt.earRot = 0; cat.pt.tailFlick = 0.7;
          if (this.t > rand(1.4, 3)) { this.phase = 1; this.t = 0; }
        } else if (P === 1) {
          cat.setPose('crouch');
          this.speed = Math.abs(dx) > 70 ? 42 : 0;
          this.target = prey.x - cat.facing * 62;
          if (Math.abs(dx) < 90 && this.t > 1.2) { this.phase = 2; this.t = 0; }
          if (this.t > 6) this.start('idle');
        } else if (P === 2) {
          cat.setPose('crouch');                   // o rebolado antes do bote
          cat.p.lean = Math.sin(this.t * 16) * 0.5;
          this.speed = 0;
          if (this.t > 1.1) { this.phase = 3; this.t = 0; cat.p.lean = 0; }
        } else {
          cat.setPose('stretch'); this.speed = 260;
          this.target = prey.x;
          if (Math.abs(dx) < 24) {
            s.needs.stim = clamp(s.needs.stim - 16, 0, 100);
            A.thud(0.15);
            this.start(chance(0.4) ? 'hunt' : 'groom');
          }
          if (this.t > 1.6) this.start('idle');
        }
        break;
      }

      case 'window': {
        this.look = { x: SPOTS.window, y: 180 };
        if (!this.atTarget()) { cat.setPose('stand'); break; }
        cat.facing = -1;
        cat.setPose(chance(dt) ? 'loaf' : 'sit');
        cat.pt.headY = -26; cat.pt.headTurn = -0.4; cat.pt.pupil = 0.85;
        s.needs.stim = clamp(s.needs.stim - dt * 1.4, 0, 100);
        if (chance(dt * 0.12)) {                   // o chilreio de caçador frustrado
          A.meow('trill', 0.9);
          cat.pt.mouthOpen = 0.5;
          setTimeout(() => { cat.pt.mouthOpen = 0; }, 500);
          this.say('Ele chilreia para o pássaro. É frustração de caçador que não alcança.');
        }
        if (this.t > rand(10, 22)) this.start(this.choose());
        break;
      }

      case 'scratch': {
        if (!this.atTarget()) { cat.setPose('stand'); break; }
        cat.facing = 1;
        cat.setPose('stretch');
        cat.pt.headY = -20;
        cat.p.lean = Math.sin(this.t * 9) * 0.06;
        s.needs.stim = clamp(s.needs.stim - dt * 3, 0, 100);
        s.coat.mats = clamp(s.coat.mats - dt * 0.01, 0, 1);
        if (this.t > rand(2.5, 4.5)) { cat.p.lean = 0; this.start('stretchAfter'); }
        break;
      }

      case 'stretchAfter': {
        cat.setPose('stretch');
        if (this.t > 1.4) this.start('idle');
        break;
      }

      case 'greet': {
        this.look = YOU;
        if (!this.atTarget()) { cat.setPose('stand'); cat.pt.tailA = 1.5; break; }
        cat.pt.tailA = 1.6; cat.pt.tailCurl = 1.6;   // rabo em pé com a ponta dobrada
        if (P === 0) {
          cat.setPose('stand');
          cat.pt.headTurn = 1; cat.pt.squint = 0.5; cat.pt.purr = 1;
          A.purr(true, 0.8);
          if (this.t > 0.4 && this.t < 0.5) A.meow('trill', 0.9);
          if (this.t > 2.2) { this.phase = 1; this.t = 0; }
        } else if (P === 1) {                       // esfregar a cabeça: marcação de cheiro
          cat.setPose('stand');
          cat.pt.headTilt = Math.sin(this.t * 4) * 0.4;
          cat.pt.headY = 6;
          s.needs.social = clamp(s.needs.social - dt * 22, 0, 100);
          s.bond = clamp(s.bond + dt * 0.25, 0, 100);
          if (this.t > 2.6) {
            A.purr(false);
            this.say(`${s.name} esfregou a cabeça em você. Ele está te marcando como dele.`);
            this.start('idle');
          }
        }
        break;
      }

      case 'attention': {
        this.look = YOU;
        if (!this.atTarget()) { cat.setPose('stand'); break; }
        cat.setPose('sit');
        cat.pt.tailFlick = 0.25;
        if (P === 0) { A.meow('meow', 0.55); this.phase = 1; this.t = 0; this.say(`${s.name} sentou de frente para você e está te encarando.`); }
        if (this.t > rand(4, 8)) {
          s.needs.social = clamp(s.needs.social - 10, 0, 100);
          this.start('idle');
        }
        break;
      }

      case 'knead': {
        if (!this.atTarget()) { cat.setPose('stand'); break; }
        cat.setPose('loaf');
        cat.pt.purr = 1; cat.pt.squint = 0.85; cat.pt.eyeOpen = 0.4;
        A.purr(true, 1);
        s.stress = clamp(s.stress - dt * 4, 0, 100);
        s.needs.social = clamp(s.needs.social - dt * 4, 0, 100);
        if (this.t < 0.2) this.say(`${s.name} está amassando pãozinho. Isso é gato de filhote satisfeito.`);
        if (this.t > rand(8, 14)) { A.purr(false); this.start('drowse'); }
        break;
      }

      case 'hide': {
        if (!this.atTarget()) { cat.setPose('stand'); this.speed = 130; break; }
        cat.setPose('curl');
        cat.pt.earRot = 0.55; cat.pt.eyeOpen = 0.45; cat.pt.pupil = 0.9;
        this.look = null;
        s.stress = clamp(s.stress - dt * 2.2, 0, 100);
        if (this.t > rand(15, 40) && s.stress < 55) this.start('idle');
        break;
      }

      case 'play': return this.tickPlay(dt);

      default: this.start('idle');
    }
  }

  /* ------------------------------------------------------- brincadeira */
  setToy(pt) {
    const now = this.now ?? 0;
    if (this.toy) {
      const dx = pt.x - this.toy.x, dy = pt.y - this.toy.y;
      const v = Math.hypot(dx, dy);
      const dir = Math.sign(dx) || this.lastToyDir;
      if (dir !== this.lastToyDir) { this.dirChanges++; this.lastToyDir = dir; }
      this.toy.v = v;
      this.toy.still = v < 1.2 ? (this.toy.still ?? 0) + 1 : 0;
    }
    this.toy = { ...pt, v: this.toy?.v ?? 0, still: this.toy?.still ?? 0 };
  }

  tickPlay(dt) {
    const cat = this.cat, s = this.s;
    const toy = this.toy;
    this.look = toy ?? YOU;

    // Sem energia ou com fome, gato não brinca. Ele desiste, e está certo.
    if (s.needs.energy < 16 || s.needs.hunger > 88) {
      this.say(`${s.name} não está a fim. Está ${s.needs.energy < 16 ? 'exausto' : 'com fome'}.`);
      this.start('idle'); return;
    }
    if (!toy) { cat.setPose('sit'); cat.pt.pupil = 0.9; return; }

    // Interesse: movimento errático prende; movimento repetitivo entedia;
    // presa que fica parada e volta a fugir prende mais ainda.
    const erratic = clamp(this.dirChanges / 6);
    const pause = clamp(toy.still / 25);
    this.dirChanges *= (1 - dt * 0.6);
    this.boredom = clamp(this.boredom + dt * (0.055 - erratic * 0.06 - pause * 0.03));
    this.catchDebt = clamp(this.catchDebt + dt * 0.035);
    this.interest = clamp(0.35 + erratic * 0.5 + pause * 0.25 - this.boredom - this.catchDebt * 0.55);

    cat.pt.pupil = clamp(0.55 + this.interest * 0.5);
    cat.pt.arousal = this.interest;
    cat.pt.tailFlick = 0.35 + this.interest * 0.5;
    const dx = toy.x - cat.x;
    if (Math.abs(dx) > 26) cat.facing = dx > 0 ? 1 : -1;

    if (this.interest < 0.12) {
      this.say(this.catchDebt > 0.7
        ? `${s.name} desistiu. Você nunca deixou ele pegar — isso frustra gato.`
        : `${s.name} enjoou. Varinha que anda sempre igual vira móvel.`);
      s.stress = clamp(s.stress + this.catchDebt * 10, 0, 100);
      this.start('idle');
      return;
    }

    const P = this.phase;
    if (P === 0) {                                  // fixar
      cat.setPose('crouch');
      this.speed = 0; this.target = null;
      if (Math.abs(dx) < 240 && this.t > 0.7) { this.phase = 1; this.t = 0; }
    } else if (P === 1) {                           // espreitar
      cat.setPose('crouch');
      this.target = toy.x - cat.facing * 70;
      this.speed = Math.abs(dx) > 90 ? lerp(30, 110, this.interest) : 0;
      if (Math.abs(dx) < 130 && this.t > lerp(2.2, 0.7, this.interest)) { this.phase = 2; this.t = 0; }
    } else if (P === 2) {                           // rebolar
      cat.setPose('crouch');
      cat.p.lean = Math.sin(this.t * 18) * 0.5;
      this.speed = 0; this.target = null;
      if (this.t > 0.8) { this.phase = 3; this.t = 0; cat.p.lean = 0; }
    } else if (P === 3) {                           // bote
      cat.setPose('stretch');
      this.target = toy.x;
      this.speed = 250;
      if (Math.abs(dx) < 46) {
        this.phase = 4; this.t = 0;
        this.catchDebt = 0; this.boredom = clamp(this.boredom - 0.35, 0, 1);
        s.needs.stim = clamp(s.needs.stim - 22, 0, 100);
        s.needs.energy = clamp(s.needs.energy - 3, 0, 100);
        s.log.catches++;
        s.bond = clamp(s.bond + 0.5, 0, 100);
        A.thud(0.16);
      } else if (this.t > 1.3) { this.phase = 0; this.t = 0; this.boredom = clamp(this.boredom + 0.1); }
    } else {                                        // agarrar e coelhinho
      cat.setPose('side');
      this.speed = 0; this.target = null;
      cat.pt.mouthOpen = 0.4;
      cat.p.lean = Math.sin(this.t * 22) * 0.22;
      if (this.t > 1.4) {
        cat.pt.mouthOpen = 0; cat.p.lean = 0;
        this.phase = 0; this.t = 0;
        s.log.plays++;
        if (s.needs.stim < 22) {
          this.say(`${s.name} caçou o bastante. Gato encerra a brincadeira antes de você.`);
          this.start('groom');
        }
      }
    }
  }

  /* ------------------------------------------------ leitura corporal */
  updateRead(drive) {
    const s = this.s, cat = this.cat;
    let mood = 'tranquilo', body = '';

    if (this.act === 'sleep') { mood = 'dormindo'; body = 'Respiração lenta, patas recolhidas. Gato dorme ~16h por dia.'; }
    else if (this.act === 'drowse') { mood = 'sonolento'; body = 'Olhos meio fechados, sem intenção de se mexer.'; }
    else if (this.petting && this.overstim > 0.55) { mood = 'no limite'; body = 'Rabo batendo e orelhas girando para trás. Solte agora.'; }
    else if (this.petting && this.consent > 0.45) { mood = 'aceitando carinho'; body = 'Olhos apertados, ronronando. Pare antes que ele canse.'; }
    else if (this.act === 'hide') { mood = 'assustado'; body = 'Encolhido, pupila cheia, orelhas baixas. Deixe ele em paz.'; }
    else if (this.act === 'zoomies') { mood = 'elétrico'; body = 'Energia acumulada saindo de uma vez. É o preço de não brincar.'; }
    else if (this.act === 'play') {
      mood = this.interest > 0.6 ? 'caçando' : this.interest > 0.3 ? 'meio interessado' : 'perdendo o interesse';
      body = this.catchDebt > 0.6 ? 'Ele nunca pegou a presa. Deixe pegar.' : 'Pupilas dilatadas, rabo tremendo na ponta.';
    }
    else if (this.act === 'demandFood') { mood = 'com fome'; body = 'Sentado na tigela, rabo em pé, olhando para você.'; }
    else if (this.act === 'rejectFood') { mood = 'recusando'; body = 'Cheirou e virou a cara. Comida velha ele não come.'; }
    else if (this.act === 'complainLitter') { mood = 'incomodado'; body = 'A caixa está suja demais. Ele está segurando.'; }
    else if (this.act === 'greet' || this.act === 'knead') { mood = 'afetuoso'; body = 'Rabo em pé com a ponta curvada — isso é um gato feliz de te ver.'; }
    else if (this.act === 'attention') { mood = 'te cobrando'; body = 'Encarando e miando. Quer alguma coisa de você.'; }
    else if (this.act === 'window') { mood = 'atento'; body = 'Fixado na janela. Instinto de caça sem lugar para ir.'; }
    else if (this.act === 'groom') { mood = 'se limpando'; body = 'Gato saudável se lambe. Gato parado de se lamber está doente.'; }
    else if (this.act === 'hunt') { mood = 'em modo caça'; body = 'Corpo baixo, passo lento, olhos travados.'; }
    else if (s.stress > 60) { mood = 'estressado'; body = 'Tenso, atento demais ao ambiente.'; }
    else if (s.needs.stim > 75) { mood = 'entediado'; body = 'Sem nada para caçar. Isso vira bagunça mais tarde.'; }
    else if (s.bond < 20) { mood = 'desconfiado'; body = 'Ele ainda não decidiu se confia em você.'; }
    else if (drive > 0.65) { mood = 'ligado'; body = 'Horário natural de atividade — amanhecer e fim de tarde.'; }

    this.read = { mood, body };
  }
}
