import AnimatedLogo from './AnimatedLogo';
import { Sparks } from './RoleArt';

const TENTS = ['#F27BAE', '#3F86E6', '#35A772', '#F5C21B', '#E2493F'];

/** Full-screen LEED loading screen: the logo bobbing over a row of canopies that light up in turn. */
export default function LoadingScreen({ label = 'Setting up the stalls' }: { label?: string }) {
  return (
    <div className="loader burst" role="status" aria-live="polite">
      <Sparks />
      <div className="loader-stage">
        <AnimatedLogo ring className="loader-logo" priority />
        <span className="loader-shadow" aria-hidden="true" />
        <div className="loader-tents" aria-hidden="true">
          {TENTS.map((c, i) => (
            <svg key={c} viewBox="0 0 48 40" style={{ animationDelay: `${i * 0.16}s` }}>
              <path d="M4 18 24 4l20 14Z" fill={c} stroke="#1f0a45" strokeWidth="3" strokeLinejoin="round" />
              <path d="M4 18h40v4c-3.3 3-6.7 3-10 0-3.3 3-6.7 3-10 0-3.3 3-6.7 3-10 0-3.3 3-6.7 3-10 0Z" fill={c} stroke="#1f0a45" strokeWidth="3" strokeLinejoin="round" />
              <path d="M9 24v14M39 24v14" stroke="#1f0a45" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ))}
        </div>
        <p className="loader-text">
          {label}
          <span className="loader-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>
      </div>
    </div>
  );
}
