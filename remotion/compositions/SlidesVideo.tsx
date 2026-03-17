import {AbsoluteFill, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import type {FC} from "react";

import type {SlidesVideoCompositionProps, SlidesVideoSlide} from "../types";

const SlideScene: FC<{
  config: SlidesVideoCompositionProps["config"];
  slide: SlidesVideoSlide;
}> = ({config, slide}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const intro = spring({
    fps,
    frame,
    config: {
      damping: 200,
      stiffness: 180,
    },
  });
  const imageScale = interpolate(frame, [0, slide.durationFrames], [1.08, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const overlayOpacity = interpolate(frame, [0, 14, slide.durationFrames - 18, slide.durationFrames], [0.42, 0.72, 0.72, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textTranslate = interpolate(intro, [0, 1], [80, 0]);
  const textOpacity = interpolate(intro, [0, 1], [0, 1]);

  return (
    <AbsoluteFill style={{backgroundColor: config.brand.primaryColor, overflow: "hidden"}}>
      {slide.imageUrl ? (
        <Img
          src={slide.imageUrl}
          style={{
            position: "absolute",
            inset: -48,
            width: "calc(100% + 96px)",
            height: "calc(100% + 96px)",
            objectFit: "cover",
            transform: `scale(${imageScale})`,
            filter: "saturate(1.08) contrast(1.03)",
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background: `linear-gradient(160deg, ${config.backgroundGradient[0]} 0%, ${config.backgroundGradient[1]} 100%)`,
          opacity: slide.imageUrl ? overlayOpacity : 1,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 18% 20%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 36%), radial-gradient(circle at 88% 86%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 28%)",
        }}
      />
      <AbsoluteFill
        style={{
          padding: 84,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          color: "#ffffff",
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
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 24px",
              borderRadius: 999,
              backgroundColor: "rgba(12,12,12,0.44)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(14px)",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: config.brand.accentColor,
              }}
            />
            <span
              style={{
                fontFamily: config.brand.fontFamily,
                fontSize: 28,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {config.brand.name}
            </span>
          </div>
          <div
            style={{
              fontFamily: config.brand.fontFamily,
              fontSize: 30,
              fontWeight: 700,
              padding: "16px 24px",
              borderRadius: 999,
              backgroundColor: "rgba(12,12,12,0.44)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            {slide.slideNumber}/{config.slides.length}
          </div>
        </div>

        <div
          style={{
            transform: `translateY(${textTranslate}px)`,
            opacity: textOpacity,
            display: "grid",
            gap: 28,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 18px",
              width: "fit-content",
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.12)",
              fontSize: 24,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Swipe story
          </div>
          <div
            style={{
              fontFamily: config.brand.fontFamily,
              fontSize: 104,
              lineHeight: 0.94,
              letterSpacing: "-0.04em",
              maxWidth: 860,
              textWrap: "balance",
            }}
          >
            {slide.headline}
          </div>
          <div
            style={{
              maxWidth: 820,
              fontSize: 40,
              lineHeight: 1.24,
              color: "rgba(255,255,255,0.9)",
              padding: "28px 32px",
              borderRadius: 36,
              backgroundColor: "rgba(10,10,10,0.48)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(16px)",
            }}
          >
            {slide.body}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 16,
          }}
        >
          <div
            style={{
              height: 8,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.18)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(slide.slideNumber / config.slides.length) * 100}%`,
                height: "100%",
                backgroundColor: config.brand.accentColor,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "rgba(255,255,255,0.78)",
              fontSize: 26,
            }}
          >
            <span>{config.title}</span>
            <span>{slide.durationSeconds.toFixed(1)}s</span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const SlidesVideo: FC<SlidesVideoCompositionProps> = ({config}) => {
  return (
    <AbsoluteFill style={{backgroundColor: config.brand.primaryColor}}>
      {config.slides.map((slide) => (
        <Sequence
          key={slide.id}
          from={slide.startFrame}
          durationInFrames={slide.durationFrames}
        >
          <SlideScene config={config} slide={slide} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
