import {AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import type {FC} from "react";

import type {NarratedBrand} from "../../types";
import {resolveFontFamily} from "../../styles/fonts";

type EndCardProps = {
  brand: NarratedBrand;
  ctaText: string;
  productImageUrl: string | null;
  gradient: [string, string];
};

export const EndCard: FC<EndCardProps> = ({
  brand,
  ctaText,
  productImageUrl,
  gradient,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const reveal = spring({
    frame,
    fps,
    config: {damping: 200},
    durationInFrames: 24,
  });
  const opacity = interpolate(reveal, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(reveal, [0, 1], [0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${gradient[0]}, ${gradient[1]})`,
        padding: 72,
        justifyContent: "space-between",
        opacity,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            color: "rgba(255,255,255,0.72)",
            fontFamily: resolveFontFamily(brand.fontFamily),
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          {brand.name}
        </div>
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.12)",
            color: "white",
            fontFamily: resolveFontFamily(brand.fontFamily),
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          Narrated format
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 34,
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            width: 470,
            height: 470,
            borderRadius: 40,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.08)",
            boxShadow: "0 28px 80px rgba(0,0,0,0.28)",
            display: "grid",
            placeItems: "center",
          }}
        >
          {productImageUrl ? (
            <Img
              src={productImageUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                fontFamily: resolveFontFamily(brand.fontFamily),
                fontSize: 140,
                fontWeight: 900,
                color: "white",
              }}
            >
              {brand.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        <div
          style={{
            textAlign: "center",
            color: "white",
            fontFamily: resolveFontFamily(brand.fontFamily),
            fontSize: 62,
            fontWeight: 900,
            lineHeight: 1.02,
            maxWidth: 760,
          }}
        >
          {ctaText}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            padding: "16px 24px",
            borderRadius: 999,
            backgroundColor: `${brand.accentColor}`,
            color: brand.primaryColor,
            fontFamily: resolveFontFamily(brand.fontFamily),
            fontSize: 28,
            fontWeight: 900,
          }}
        >
          {brand.name}
        </div>
      </div>
    </AbsoluteFill>
  );
};
