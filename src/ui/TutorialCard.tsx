import { useEffect, useRef, useState } from 'preact/hooks';
import type { Park } from '../game/park';
import { TUTORIAL, TutorialProgress, pathCount } from '../game/tutorial';
import type { GameRenderer } from '../render/game-renderer';
import type { SimClient } from '../sim/sim-client';

interface Props {
  park: Park;
  sim: SimClient;
  game: GameRenderer;
  /** Panels opened so far ("park", "manage", ...). */
  opened: ReadonlySet<string>;
}

/** Step-by-step guide for the tutorial scenario. Checks progress twice a second. */
export function TutorialCard({ park, sim, game, opened }: Props) {
  const progress = useRef(new TutorialProgress());
  const startPaths = useRef(pathCount(park));
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const tick = () => {
      const i = progress.current.update({
        park,
        startPaths: startPaths.current,
        guests: sim.stats.guests,
        rideIncome: sim.stats.incomeBy.rides,
        opened,
        cameraMoved: game.cameraMoved,
      });
      setIndex(i);
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [park, sim, game, opened]);

  const step = TUTORIAL[index];
  if (!step) return null;
  if (hidden) {
    return (
      <button type="button" class="tutorial-tab" onClick={() => setHidden(false)} data-testid="tutorial-show">
        Tutorial: step {index + 1} of {TUTORIAL.length}
      </button>
    );
  }
  return (
    <aside class="tutorial" aria-label="Tutorial" aria-live="polite" data-testid="tutorial">
      <div class="tutorial-head">
        <span class="step-count">Step {index + 1} of {TUTORIAL.length}</span>
        <button type="button" class="close" onClick={() => setHidden(true)} aria-label="Hide tutorial">–</button>
      </div>
      <h2 data-testid="tutorial-title">{step.title}</h2>
      <p>{step.text}</p>
      {step.hint && <p class="tutorial-hint">{step.hint}</p>}
      <ol class="tutorial-dots" aria-hidden="true">
        {TUTORIAL.map((s, i) => (
          <li key={s.id} class={progress.current.done.has(s.id) ? 'done' : i === index ? 'now' : ''} />
        ))}
      </ol>
      {step.id !== 'goal' && (
        <button
          type="button"
          class="link"
          onClick={() => {
            progress.current.skip();
            setIndex(progress.current.index);
          }}
        >
          Skip this step
        </button>
      )}
    </aside>
  );
}
