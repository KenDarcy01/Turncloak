import { playerById, questionWon } from '../engine/game';
import { missionById, packOf } from '../engine/missions';
import { GATE_RULES } from '../engine/missions-airport';
import { TABLE_MANNERS } from '../engine/missions-dinner';
import { POOL_SAFETY } from '../engine/missions-resort';
import type { Action, GameState } from '../engine/types';
import { Gold, useNow } from '../ui/components';

/** The mission card on the host screen: how to play, the drawn prompts, and scoring. */
export function MissionBoard({ view, send }: { view: GameState; send: (a: Action) => void }) {
  const m = view.mission!;
  const card = missionById(m.cardId);
  const set = card.prompts;
  const name = (id?: string) => playerById(view, id)?.name ?? 'Someone';
  const now = useNow(250);
  const showing = m.showUntil !== null && now < m.showUntil;
  const secsLeft = showing ? Math.ceil((m.showUntil! - now) / 1000) : 0;

  return (
    <div className="mission-card fade-in">
      <div className="mission-head">
        <div>
          <h2>{card.title}</h2>
          <p className="intro">{card.intro}</p>
        </div>
        <div className="mission-facts">
          <div><span className="k">Reward</span> <Gold amount={card.reward} /></div>
          <div><span className="k">Time</span> {card.time}</div>
          <div><span className="k">You need</span> {card.props.join(' · ')}</div>
        </div>
      </div>

      {packOf(card) === 'resort' && <div className="safety">{POOL_SAFETY}</div>}
      {packOf(card) === 'dinner' && <div className="safety">{TABLE_MANNERS}</div>}
      {packOf(card) === 'airport' && <div className="safety">{GATE_RULES}</div>}

      <div className="mission-cols">
        <div className="panel">
          <div className="eyebrow">How to play</div>
          <ol className="steps">
            {card.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          {card.roles && m.roleHolders.length > 0 && (
            <div className="role-callout">
              <span className="k">{card.roles.name}</span>
              <strong>{m.roleHolders.map(name).join(', ')}</strong>
              <span className="muted">{card.roles.duty}</span>
            </div>
          )}
        </div>

        <div className="stack">
          {m.play && <PhonePanel view={view} send={send} />}
          {set && !m.play && (
            <div className="panel">
              <div className="row">
                <div className="eyebrow">{set.label}</div>
                <div className="spacer" />
                {set.kind === 'memory' && !showing && (
                  <button className="btn small" onClick={() => send({ type: 'missionShow' })}>
                    Show for {set.showSeconds} seconds
                  </button>
                )}
                {set.kind === 'memory' && showing && <span className="timer-sm">{secsLeft}</span>}
                {(set.kind === 'secret' || set.kind === 'riddle' || set.kind === 'memory') && m.items.some((it) => !it.revealed) && !showing && (
                  <button className="btn small ghost" onClick={() => send({ type: 'missionReveal', index: -1 })}>Reveal all</button>
                )}
              </div>
              {set.kind === 'memory' ? (
                showing || m.items.every((it) => it.revealed) ? (
                  <ul className="banquet">{m.items.map((it, i) => <li key={i}>{it.text}</li>)}</ul>
                ) : (
                  <p className="muted">Ten items are hidden under the cloth. Show them when everyone is watching.</p>
                )
              ) : (
                <ol className={`prompts ${m.items.length === 1 ? 'single' : ''}`}>
                  {m.items.map((it, i) => (
                    <li key={i}>
                      {set.kind === 'secret' && (
                        <div className="who">{name(it.assignee)}{set.count > 1 ? ` · turn ${i + 1}` : ''}</div>
                      )}
                      {set.kind === 'secret' && !it.revealed ? (
                        <div className="hidden-line">
                          <span className="muted">On {name(it.assignee)}&rsquo;s phone</span>
                          <button className="btn small" onClick={() => send({ type: 'missionReveal', index: i })}>Reveal</button>
                        </div>
                      ) : (
                        <div className="prompt-text">{it.text}</div>
                      )}
                      {set.kind === 'riddle' && (
                        it.revealed ? (
                          <div className="answer">{it.answer}</div>
                        ) : (
                          <button className="btn small" onClick={() => send({ type: 'missionReveal', index: i })}>Reveal answer</button>
                        )
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          <div className="panel scoring">
            <div className="eyebrow">Scoring</div>
            <div><span className="gold">Success</span> {card.scoring.success} <Gold amount={card.reward} /></div>
            <div><span className="gold">Half</span> {card.scoring.partial} <Gold amount={Math.round(card.reward / 2)} /></div>
            <div><span className="red">Failed</span> {card.scoring.fail}</div>
            {m.result !== 'pending' && (
              <div className="result">
                {m.earned > 0 ? <span className="gold">+{m.earned.toLocaleString()} added to the pot</span> : <span className="red">Nothing earned</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Phone games on the TV: who has answered, then the count and who picked what. */
function PhonePanel({ view, send }: { view: GameState; send: (a: Action) => void }) {
  const m = view.mission!;
  const play = m.play!;
  const game = missionById(m.cardId).phone!.game;
  const name = (id: string) => playerById(view, id)?.name ?? 'Someone';
  const waiting = play.players.filter((id) => !play.picks[id] && playerById(view, id)?.alive);

  if (!play.counted) {
    return (
      <div className="panel">
        <div className="row">
          <div className="eyebrow">{game === 'sabotage' ? 'Choosing in secret' : 'Answering on phones'}</div>
          <div className="spacer" />
          <button className="btn small ghost" onClick={() => send({ type: 'missionCount' })}>Count now</button>
        </div>
        <ul className="phone-status">
          {play.players.map((id) => (
            <li key={id} className={play.picks[id] ? 'done' : ''}>{name(id)} {play.picks[id] ? '✓' : '…'}</li>
          ))}
        </ul>
        <p className="muted">
          {waiting.length ? `Waiting for ${waiting.map(name).join(', ')}.` : 'Everyone is in.'}
          {game !== 'sabotage' && ` ${m.items.length} questions on every phone.`}
        </p>
      </div>
    );
  }

  if (game === 'sabotage') {
    const n = play.sabotages ?? 0;
    return (
      <div className="panel center">
        <div className="eyebrow">The count</div>
        <div className={`display sabotage-count ${n ? 'red' : 'gold'}`}>{n}</div>
        <p className="lead">{n === 0 ? 'No sabotage. Everyone guarded the gold.' : n === 1 ? 'One sabotage. Somebody who played is a Turncloak.' : `${n} sabotages. At least ${n} of those who played are Turncloaks.`}</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row">
        <div className="eyebrow">{game === 'quiz' ? 'Answers' : 'What everyone picked'}</div>
        <div className="spacer" />
        {m.items.some((it) => !it.revealed) && (
          <button className="btn small ghost" onClick={() => send({ type: 'missionReveal', index: -1 })}>Reveal all</button>
        )}
      </div>
      <ol className="prompts">
        {m.items.map((it, i) => (
          <li key={i}>
            <div className="prompt-text">{it.text}</div>
            {it.revealed ? (
              <>
                {(it.choices ?? []).map((c, j) => {
                  const who = Object.entries(play.picks).filter(([, p]) => p[i] === j).map(([id]) => name(id));
                  if (!who.length && c !== it.answer) return null;
                  return (
                    <div key={j} className="pick-line">
                      <strong className={game === 'quiz' && c === it.answer ? 'gold' : ''}>{c}{game === 'quiz' && c === it.answer ? ' ✓' : ''}</strong>{' '}
                      <span className="muted">{who.length ? who.join(', ') : 'nobody'}</span>
                    </div>
                  );
                })}
                <div className={questionWon(m, game, i) ? 'gold' : 'red'}>{questionWon(m, game, i) ? 'Won' : 'Lost'}</div>
              </>
            ) : (
              <button className="btn small" onClick={() => send({ type: 'missionReveal', index: i })}>
                {game === 'quiz' ? 'Reveal answer' : 'Reveal picks'}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
