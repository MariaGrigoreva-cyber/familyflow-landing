import React from 'react';
import {Composition} from 'remotion';
import {MotionReel} from './MotionReel';
import {CoupleBudgetReel} from './CoupleBudgetReel';
import data from './current-data.json';

export const RemotionRoot = () => {
  const fps = 30;

  const duration = Math.round(
    (Number(data.duration_seconds) || 28) * fps
  );

  return (
    <>
      <Composition
        id="MotionReel"
        component={MotionReel}
        width={1080}
        height={1920}
        fps={fps}
        durationInFrames={duration}
        defaultProps={{data}}
      />

      <Composition
        id="CoupleBudgetReel"
        component={CoupleBudgetReel}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={660}
      />
    </>
  );
};
