import {Video} from "@remotion/media";
import {AbsoluteFill} from "remotion";
import type {FC, ReactNode} from "react";

import type {NarratedBrand, NarratedClip, NarratedVideoConfig} from "../../types";
import {resolveFontFamily} from "../../styles/fonts";

export type TemplateSceneProps = {
  clip: NarratedClip;
  brand: NarratedBrand;
  visualIntensity: NarratedVideoConfig["visualIntensity"];
  platformPreset: NarratedVideoConfig["platformPreset"];
  kicker: string;
  eyebrow: string;
  accentAlign?: "left" | "right";
  footer?: ReactNode;
};

const intensityOpacity: Record<NarratedVideoConfig["visualIntensity"], number> = {
  clean: 0.16,
  balanced: 0.24,
  bold: 0.34,
};

export const BaseTemplateScene: FC<TemplateSceneProps> = ({
  clip,
  brand,
  visualIntensity,
  platformPreset,
  kicker,
  eyebrow,
  accentAlign = "left",
  footer = null,
}) => {
  return (
    <AbsoluteFill style={{backgroundColor: brand.primaryColor}}>
      <Video
        src={clip.videoUrl}
        muted
        loop
        trimAfter={clip.durationFrames}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0.54) 0%, rgba(0,0,0,0.06) 42%, rgba(0,0,0,0.74) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 0,
          [accentAlign]: 0,
          width: platformPreset === "instagram" ? 220 : 280,
          height: "100%",
          opacity: intensityOpacity[visualIntensity],
          background: `linear-gradient(${accentAlign === "left" ? "90deg" : "270deg"}, ${brand.accentColor}, transparent)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 58,
          left: 48,
          right: 48,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            color: `${brand.accentColor}`,
            fontFamily: resolveFontFamily(brand.fontFamily),
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            color: "white",
            fontFamily: resolveFontFamily(brand.fontFamily),
            fontSize: platformPreset === "instagram" ? 56 : 62,
            fontWeight: 900,
            lineHeight: 1,
            maxWidth: 820,
            textShadow: "0 8px 32px rgba(0,0,0,0.35)",
          }}
        >
          {kicker}
        </div>
      </div>

      {footer}
    </AbsoluteFill>
  );
};
