import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import type {FC} from "react";

import type {NarratedBrand} from "../../types";
import {resolveFontFamily} from "../../styles/fonts";

type SegmentLabelProps = {
  text: string;
  brand: NarratedBrand;
};

export const SegmentLabel: FC<SegmentLabelProps> = ({text, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const reveal = spring({
    frame,
    fps,
    config: {damping: 200},
    durationInFrames: 18,
  });
  const translateY = interpolate(reveal, [0, 1], [-20, 0]);
  const opacity = interpolate(reveal, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{pointerEvents: "none"}}>
      <div
        style={{
          position: "absolute",
          top: 200,
          left: 48,
          padding: "12px 20px",
          borderRadius: 16,
          backgroundColor: `${brand.primaryColor}dd`,
          border: `1px solid ${brand.accentColor}66`,
          color: brand.accentColor,
          fontFamily: resolveFontFamily(brand.fontFamily),
          fontSize: 24,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: 1.1,
          transform: `translateY(${translateY}px)`,
          opacity,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
