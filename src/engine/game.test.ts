import { describe, expect, it } from 'vitest';
import { botActions } from './bots';
import { aliveIds, aliveTraitors, checkWinner, dealMission, endgameReady, murderTargets, newGame, playerById, reduce, type Ctx } from './game';
import { MISSIONS } from './missions';
import type { Action, GameState } from './types';
import { HIDDEN, TV, viewFor } from './view';

function seeded(seed = 1) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function setup(players = 8, seed = 1) {
  const ctx: Ctx = { rng: seeded(seed), now: 0 };
  let s = newGame('ABCD');
  for (let i = 0; i < players; i++) s = reduce(s, { type: 'join', playerId: `p${i}`, name: `P${i}` }, ctx);
  s = reduce(s, { type: 'start' }, ctx);
  return { s, ctx };
}

const run = (s: GameState, ctx: Ctx, ...actions: Action[]) => actions.reduce((x, a) => reduce(x, a, ctx), s);

describe('setup', () => {
  it('assigns the right number of Turncloaks', () => {
    expect(aliveTraitors(setup(5).s)).toHaveLength(1);
    expect(aliveTraitors(setup(8).s)).toHaveLength(2);
    expect(aliveTraitors(setup(14).s)).toHaveLength(3);
  });

  it('needs at least four players', () => {
    const ctx: Ctx = { rng: seeded(), now: 0 };
    let s = newGame('X');
    for (let i = 0; i < 3; i++) s = reduce(s, { type: 'join', playerId: `p${i}`, name: `P${i}` }, ctx);
    expect(reduce(s, { type: 'start' }, ctx).phase).toBe('lobby');
  });
});

describe('a day', () => {
  it('runs mission, vote, banishment, then night', () => {
    let { s, ctx } = setup(8);
    s = run(s, ctx, { type: 'advance' });
    expect(s.phase).toBe('mission');
    s = run(s, ctx, { type: 'missionResult', result: 'partial' }, { type: 'advance' });
    expect(s.pot).toBeGreaterThan(0);
    expect(s.phase).toBe('roundtable');
    s = run(s, ctx, { type: 'advance' });
    expect(s.phase).toBe('vote');

    // Everyone votes for p0, p0 votes for p1.
    for (const id of aliveIds(s)) s = run(s, ctx, { type: 'castVote', playerId: id, targetId: id === 'p0' ? 'p1' : 'p0' });
    expect(s.phase).toBe('banishment');

    // Read out every vote, then the verdict, then the role.
    while (s.banishment!.step === 'votes') s = run(s, ctx, { type: 'revealNext' });
    expect(s.banishment!.banishedId).toBe('p0');
    s = run(s, ctx, { type: 'advance' });
    expect(s.banishment!.step).toBe('role');
    expect(s.players.find((p) => p.id === 'p0')!.alive).toBe(false);
    s = run(s, ctx, { type: 'advance' });
    expect(['night', 'gameOver']).toContain(s.phase);
  });

  it('holds a revote on a tie, among the tied players only', () => {
    let { s, ctx } = setup(4);
    s = run(s, ctx, { type: 'advance' }, { type: 'missionResult', result: 'fail' }, { type: 'advance' }, { type: 'advance' });
    s = run(
      s,
      ctx,
      { type: 'castVote', playerId: 'p0', targetId: 'p1' },
      { type: 'castVote', playerId: 'p1', targetId: 'p0' },
      { type: 'castVote', playerId: 'p2', targetId: 'p0' },
      { type: 'castVote', playerId: 'p3', targetId: 'p1' },
    );
    while (s.banishment!.step === 'votes') s = run(s, ctx, { type: 'revealNext' });
    expect(s.banishment!.step).toBe('tie');
    s = run(s, ctx, { type: 'advance' });
    expect(s.phase).toBe('vote');
    expect(s.voteCandidates!.sort()).toEqual(['p0', 'p1']);
    // Tied players do not vote in the revote.
    expect(reduce(s, { type: 'castVote', playerId: 'p0', targetId: 'p1' }, ctx).votes).toEqual({});
  });
});

describe('night', () => {
  it('only lets Turncloaks murder, and only Faithful can be murdered', () => {
    let { s, ctx } = setup(8);
    s = { ...s, phase: 'night' };
    const traitors = aliveTraitors(s).map((p) => p.id);
    const faithful = aliveIds(s).find((id) => !traitors.includes(id))!;
    expect(reduce(s, { type: 'nightPick', playerId: faithful, targetId: traitors[0] }, ctx)).toBe(s);
    expect(reduce(s, { type: 'nightPick', playerId: traitors[0], targetId: traitors[1] }, ctx)).toBe(s);
    s = run(s, ctx, ...traitors.map((t) => ({ type: 'nightPick' as const, playerId: t, targetId: faithful })));
    s = run(s, ctx, { type: 'advance' });
    expect(s.phase).toBe('breakfast');
    expect(s.murdered).toBe(faithful);
    expect(s.day).toBe(2);
  });
});

describe('secrecy', () => {
  it('hides roles and Turncloak data from the TV and from Faithful', () => {
    let { s, ctx } = setup(8);
    const traitors = aliveTraitors(s).map((p) => p.id);
    const faithful = aliveIds(s).find((id) => !traitors.includes(id))!;
    s = run({ ...s, phase: 'night' }, ctx, { type: 'traitorChat', playerId: traitors[0], text: 'shh' });

    const tv = viewFor(s, TV);
    expect(Object.keys(tv.roles)).toHaveLength(0);
    expect(tv.traitorChat).toHaveLength(0);

    const f = viewFor(s, faithful);
    expect(Object.keys(f.roles)).toEqual([faithful]);
    expect(f.traitorChat).toHaveLength(0);

    const t = viewFor(s, traitors[0]);
    expect(Object.keys(t.roles).sort()).toEqual([...traitors, traitors[0]].filter((v, i, a) => a.indexOf(v) === i).sort());
    expect(t.traitorChat).toHaveLength(1);
  });

  it('hides votes until they are read out', () => {
    let { s, ctx } = setup(5);
    s = run(s, ctx, { type: 'advance' }, { type: 'missionResult', result: 'fail' }, { type: 'advance' }, { type: 'advance' });
    s = run(s, ctx, { type: 'castVote', playerId: 'p0', targetId: 'p1' });
    expect(viewFor(s, 'p2').votes.p0).toBe(HIDDEN);
    expect(viewFor(s, 'p0').votes.p0).toBe('p1');
  });

  it('keeps the murder victim secret until breakfast is revealed', () => {
    let { s, ctx } = setup(8);
    s = { ...s, phase: 'night' };
    s = run(s, ctx, { type: 'advance' });
    const victim = s.murdered!;
    const tv = viewFor(s, TV);
    expect(tv.murdered).toBeNull();
    expect(tv.players.find((p) => p.id === victim)!.alive).toBe(true);
    s = run(s, ctx, { type: 'advance' });
    expect(viewFor(s, TV).murdered).toBe(victim);
  });
});

describe('full games with bots', () => {
  it('always reaches a winner', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let { s, ctx } = setup(4 + (seed % 12), seed);
      let steps = 0;
      while (s.phase !== 'gameOver' && steps++ < 2000) {
        if (s.phase === 'mission' && s.mission?.result === 'pending') {
          s = reduce(s, { type: 'missionResult', result: 'success' }, ctx);
          continue;
        }
        // Treat everyone as a bot.
        const all = { ...s, players: s.players.map((p) => ({ ...p, isBot: true })) };
        const acts = botActions(all, ctx.rng);
        s = acts.length ? run(s, ctx, ...acts) : reduce(s, { type: 'advance' }, ctx);
      }
      expect(s.phase).toBe('gameOver');
      expect(s.winner).toBe(checkWinner(s) ?? s.winner);
    }
  });
});

describe('views', () => {
  it('lets a Turncloak see murder targets from their own redacted view', () => {
    const { s } = setup(8);
    const night = { ...s, phase: 'night' as const };
    const t = aliveTraitors(night)[0].id;
    expect(murderTargets(viewFor(night, t)).sort()).toEqual(murderTargets(night).sort());
  });
});

describe('missions', () => {
  it('sends a secret prompt only to its player, until revealed', () => {
    const { s: base, ctx } = setup(8);
    const s = { ...base, phase: 'mission' as const, mission: dealMission(base, 'minstrel-hum', ctx.rng) };
    expect(s.mission!.items).toHaveLength(6);
    const first = s.mission!.items[0];
    const other = aliveIds(s).find((id) => id !== first.assignee)!;
    expect(viewFor(s, first.assignee!).mission!.items[0].text).toBe(first.text);
    expect(viewFor(s, other).mission!.items[0].text).toBe('');
    expect(viewFor(s, TV).mission!.items[0].text).toBe('');
    const revealed = reduce(s, { type: 'missionReveal', index: 0 }, ctx);
    expect(viewFor(revealed, TV).mission!.items[0].text).toBe(first.text);
  });

  it('gives secret prompts to the role holder', () => {
    const { s, ctx } = setup(6);
    const m = dealMission(s, 'portrait-hall', ctx.rng);
    expect(m.roleHolders).toHaveLength(1);
    expect(m.items[0].assignee).toBe(m.roleHolders[0]);
  });

  it('hides riddle answers until revealed', () => {
    const { s: base, ctx } = setup(6);
    const s = { ...base, phase: 'mission' as const, mission: dealMission(base, 'riddle-gate', ctx.rng) };
    expect(viewFor(s, TV).mission!.items[0].text).not.toBe('');
    expect(viewFor(s, TV).mission!.items[0].answer).toBeUndefined();
    const r = reduce(s, { type: 'missionReveal', index: 0 }, ctx);
    expect(viewFor(r, TV).mission!.items[0].answer).toBeTruthy();
  });

  it('every mission card deals without error', () => {
    const { s, ctx } = setup(4);
    for (const card of MISSIONS) {
      const m = dealMission(s, card.id, ctx.rng);
      expect(m.items.length).toBe(card.prompts?.count ?? 0);
    }
  });
});

describe('mission packs', () => {
  it('only draws missions from the chosen pack', () => {
    for (const pack of ['castle', 'resort', 'dinner'] as const) {
      let { s, ctx } = setup(6);
      s = { ...s, settings: { ...s.settings, missionPack: pack } };
      s = reduce(s, { type: 'advance' }, ctx);
      const card = MISSIONS.find((m) => m.id === s.mission!.cardId)!;
      expect(card.pack ?? 'castle').toBe(pack);
    }
  });
});

describe('bots', () => {
  function botGame(humans: number, bots: number, seed: number) {
    let now = 1_000_000;
    const rng = seeded(seed);
    const ctx = () => ({ rng, now });
    let s = newGame('BOTS');
    for (let i = 0; i < humans; i++) s = reduce(s, { type: 'join', playerId: `h${i}`, name: `H${i}` }, ctx());
    for (let i = 0; i < bots; i++) s = reduce(s, { type: 'addBot' }, ctx());
    s = reduce(s, { type: 'start' }, ctx());
    return { s, step: (a: Action) => (s = reduce(s, a, ctx())), tick: (ms: number) => { now += ms; s = reduce(s, { type: 'botTick' }, ctx()); }, get: () => s };
  }

  it('argue at the Round Table, naming real players', () => {
    const g = botGame(2, 6, 3);
    g.step({ type: 'advance' });
    g.step({ type: 'missionResult', result: 'success' });
    g.step({ type: 'advance' });
    for (let i = 0; i < 40; i++) g.tick(1500);
    const talk = g.get().talk;
    expect(talk.length).toBeGreaterThan(2);
    for (const line of talk) {
      expect(g.get().players.find((p) => p.id === line.from)!.isBot).toBe(true);
      expect(line.text).not.toContain('{t}');
    }
  });

  it('give mission jobs and secret prompts only to real players', () => {
    const g = botGame(2, 6, 4);
    for (let i = 0; i < 20; i++) {
      const m = dealMission(g.get(), 'minstrel-hum', seeded(i));
      for (const it of m.items) expect(it.assignee!.startsWith('h')).toBe(true);
      const w = dealMission(g.get(), 'pool-penalties', seeded(i));
      expect(w.roleHolders[0].startsWith('h')).toBe(true);
    }
  });

  it('play whole games through host ticks alone', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const g = botGame(0, 5 + (seed % 6), seed);
      for (let i = 0; i < 3000 && g.get().phase !== 'gameOver'; i++) {
        const s = g.get();
        if (s.phase === 'mission' && s.mission?.result === 'pending') g.step({ type: 'missionResult', result: 'partial' });
        else if (['roleReveal', 'breakfast', 'mission', 'banishment'].includes(s.phase)) g.step({ type: 'advance' });
        else if (s.phase === 'roundtable') { g.tick(1500); if (i % 10 === 0) g.step({ type: 'advance' }); }
        else if (s.phase === 'night') { g.tick(3000); if (i % 8 === 0) g.step({ type: 'advance' }); }
        else if (s.phase === 'endgameVote') { g.tick(3000); if (endgameReady(s)) g.step({ type: 'advance' }); }
        else g.tick(3000);
      }
      expect(g.get().phase).toBe('gameOver');
    }
  });
});

describe('changing the table', () => {
  it('lets new players in mid-game only while the doors are open, always as Faithful', () => {
    let { s, ctx } = setup(5);
    s = run(s, ctx, { type: 'advance' });
    expect(run(s, ctx, { type: 'join', playerId: 'late', name: 'Late' }).players).toHaveLength(5);
    s = run(s, ctx, { type: 'setDoors', open: true }, { type: 'join', playerId: 'late', name: 'Late' }, { type: 'addBot' });
    expect(s.players).toHaveLength(7);
    expect(s.roles.late).toBe('faithful');
    expect(s.roles[s.players[6].id]).toBe('faithful');
    expect(viewFor(s, TV).roles.late).toBeUndefined();
  });

  it('removes from the lobby without a trace', () => {
    const ctx: Ctx = { rng: seeded(), now: 0 };
    let s = newGame('X');
    s = run(s, ctx, { type: 'join', playerId: 'a', name: 'A' }, { type: 'addBot' });
    s = run(s, ctx, { type: 'removePlayer', targetId: 'a' });
    expect(s.players.map((p) => p.id)).not.toContain('a');
  });

  it('a removed player leaves, their role is shown, and their vote is withdrawn', () => {
    let { s, ctx } = setup(8);
    s = run(s, ctx, { type: 'advance' }, { type: 'missionResult', result: 'fail' }, { type: 'advance' }, { type: 'advance' });
    const ids = aliveIds(s);
    const leaver = ids.find((id) => s.roles[id] === 'faithful')!;
    s = run(s, ctx, { type: 'castVote', playerId: leaver, targetId: ids.find((i) => i !== leaver)! });
    s = run(s, ctx, { type: 'removePlayer', targetId: leaver });
    expect(playerById(s, leaver)!.out!.by).toBe('left');
    expect(s.votes[leaver]).toBeUndefined();
    expect(viewFor(s, TV).roles[leaver]).toBe('faithful');
    // The rest vote and the round still closes.
    for (const id of aliveIds(s)) s = run(s, ctx, { type: 'castVote', playerId: id, targetId: aliveIds(s).find((t) => t !== id)! });
    expect(s.phase).toBe('banishment');
  });

  it('ends the game if the last Turncloak leaves', () => {
    let { s, ctx } = setup(5);
    s = run(s, ctx, { type: 'removePlayer', targetId: aliveTraitors(s)[0].id });
    expect(s.phase).toBe('gameOver');
    expect(s.winner).toBe('faithful');
  });

  it('frees a seat for another phone and lets it be picked up once', () => {
    let { s, ctx } = setup(5);
    expect(run(s, ctx, { type: 'claimSeat', playerId: 'p1' })).toBe(s);
    s = run(s, ctx, { type: 'releaseSeat', targetId: 'p1' });
    expect(playerById(s, 'p1')!.away).toBe(true);
    s = run(s, ctx, { type: 'claimSeat', playerId: 'p1' });
    expect(playerById(s, 'p1')!.away).toBeUndefined();
  });
});
