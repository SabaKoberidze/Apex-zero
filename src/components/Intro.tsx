export function Intro({ count, onStart }: { count: number; onStart: () => void }) {
  return (
    <div className="view">
      <div className="intro">
        <div className="kicker">
          <b>11 QUESTIONS</b>
          <span>{count} CARS INDEXED / ONE SHORTLIST</span>
        </div>

        <h1 className="mega">
          Find the car<br />you actually<br /><span className="hot">want</span>
        </h1>

        <div className="rule-dash" />

        <p className="lede">
          Eleven questions, the ones that actually narrow it down: where the car
          lives, what shape it is, who rides in it, what drives it, and how much you
          want to spend. Every answer scores the whole catalogue locally, on your
          own machine. The volume in the tunnel is not a car. It is the shape of
          what you are describing, and it changes as you answer.
        </p>
      </div>

      <div className="intro-foot">
        <button className="btn" onClick={onStart}>START THE SEARCH &nbsp;&gt;</button>
        <span className="spec-line">No account / no dealer&nbsp;&nbsp;·&nbsp;&nbsp;~90 seconds</span>
      </div>
    </div>
  );
}
