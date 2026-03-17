import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import type {FC} from "react";

type ProgressBarProps = {
  accentColor: string;
  top?: number;
};

export const ProgressBar: FC<ProgressBarProps> = ({
  accentColor,
  top = 54,
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const width = interpolate(frame, [0, durationInFrames], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{pointerEvents: "none"}}>
      <div
        style={{
          position: "absolute",
          top,
          left: 48,
          right: 48,
          height: 8,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: "rgba(255,255,255,0.16)",
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            borderRadius: 999,
            background: `linear-gradient(90deg, ${accentColor}, rgba(255,255,255,0.92))`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
