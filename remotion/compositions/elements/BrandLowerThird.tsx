import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import type {FC} from "react";

import type {NarratedBrand} from "../../types";
import {resolveFontFamily} from "../../styles/fonts";

type BrandLowerThirdProps = {
  brand: NarratedBrand;
  text: string;
};

export const BrandLowerThird: FC<BrandLowerThirdProps> = ({brand, text}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entrance = spring({
    frame,
    fps,
    config: {damping: 200},
    durationInFrames: 20,
  });

  const translateX = interpolate(entrance, [0, 1], [-80, 0]);
  const opacity = interpolate(entrance, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{pointerEvents: "none"}}>
      <div
        style={{
          position: "absolute",
          left: 48,
          top: 110,
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "18px 24px",
          borderRadius: 999,
          backgroundColor: "rgba(0,0,0,0.45)",
          border: `1px solid ${brand.accentColor}55`,
          transform: `translateX(${translateX}px)`,
          opacity,
          backdropFilter: "blur(16px)",
        }}
      >
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: `linear-gradient(135deg, ${brand.accentColor}, ${brand.secondaryColor})`,
            color: brand.primaryColor,
            fontFamily: resolveFontFamily(brand.fontFamily),
            fontSize: 26,
            fontWeight: 900,
          }}
        >
          {brand.name.slice(0, 1).toUpperCase()}
        </div>
        <div
          style={{
            color: "white",
            fontFamily: resolveFontFamily(brand.fontFamily),
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: 0.2,
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
