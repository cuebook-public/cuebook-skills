import * as React from "react";
import {useCurrentFrame, useVideoConfig} from "remotion";

export type CuebookMotionComponentProps = {
  externalTimeMs?: number;
  autoplay?: boolean;
  reducedMotion?: boolean;
};

export function createCuebookRemotionComposition(
  MotionComponent: React.ComponentType<CuebookMotionComponentProps>,
) {
  return function CuebookRemotionComposition() {
    const frame = useCurrentFrame();
    const {fps} = useVideoConfig();
    const externalTimeMs = (frame / fps) * 1000;
    return <MotionComponent externalTimeMs={externalTimeMs} autoplay={false} reducedMotion={false} />;
  };
}
