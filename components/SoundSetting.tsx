'use client';

import { useEffect, useState } from 'react';
import { setSoundOn, soundIsOn } from './ClickSounds';

/** On phones the speaker button is gone from the top bar, so the switch lives here. */
export default function SoundSetting() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(soundIsOn()), []);
  return (
    <label className="switch-row">
      <span>
        <strong>Click sounds</strong>
        <small>A short sound on every tap.</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          setSoundOn(e.target.checked);
        }}
      />
    </label>
  );
}
