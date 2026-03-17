import {createTikTokStyleCaptions} from "@remotion/captions";
import type {Caption, TikTokPage} from "@remotion/captions";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {useMemo} from "react";
import type {FC} from "react";

import type {NarratedBrand, NarratedVideoConfig} from "../../types";
import {resolveFontFamily} from "../../styles/fonts";

type AnimatedCaptionProps = {
  captions: Caption[];
  startFrame: number;
  brand: NarratedBrand;
  style: NarratedVideoConfig["captions"];
};

const CaptionPage: FC<{
  page: TikTokPage;
  brand: NarratedBrand;
  style: NarratedVideoConfig["captions"];
}> = ({page, brand, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const absoluteTimeMs = page.startMs + (frame / fps) * 1000;
  const bottom =
    style.position === "top_center" ? 112 : style.position === "center" ? 580 : 200;

  return (
    <AbsoluteFill style={{pointerEvents: "none"}}>
      <div
        style={{
          position: "absolute",
          left: 54,
          right: 54,
          bottom,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 8,
            rowGap: 12,
            padding: "16px 24px",
            borderRadius: 24,
            backgroundColor: style.backgroundColor,
            backdropFilter: "blur(18px)",
          }}
        >
          {page.tokens.map((token) => {
            const isActive = token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;
            const localTokenFrame = Math.max(
              0,
              Math.round(((absoluteTimeMs - token.fromMs) / 1000) * fps),
            );
            const pop = spring({
              frame: localTokenFrame,
              fps,
              config: {damping: 200},
              durationInFrames: 10,
            });
            const scale = isActive
              ? interpolate(pop, [0, 1], [0.94, 1.05], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.quad),
                })
              : 1;

            return (
              <span
                key={`${token.fromMs}-${token.text}`}
                style={{
                  color: isActive ? style.highlightColor : style.textColor,
                  transform: `scale(${scale})`,
                  whiteSpace: "pre",
                  fontFamily: resolveFontFamily(brand.fontFamily),
                  fontSize: style.fontSize,
                  fontWeight: style.fontWeight === "extrabold" ? 900 : 700,
                  letterSpacing: -0.3,
                  textShadow: "0 2px 10px rgba(0,0,0,0.32)",
                }}
              >
                {token.text}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const AnimatedCaption: FC<AnimatedCaptionProps> = ({
  captions,
  startFrame,
  brand,
  style,
}) => {
  const {fps} = useVideoConfig();
  const {pages} = useMemo(() => {
    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: style.combineTokensWithinMilliseconds,
    });
  }, [captions, style.combineTokensWithinMilliseconds]);

  return (
    <>
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const pageStartFrame = Math.round((page.startMs / 1000) * fps);
        const endFrame = nextPage
          ? Math.round((nextPage.startMs / 1000) * fps)
          : Math.round(((page.startMs + page.durationMs) / 1000) * fps);
        const durationInFrames = Math.max(1, endFrame - pageStartFrame);

        return (
          <Sequence
            key={`${page.startMs}-${index}`}
            from={startFrame + pageStartFrame}
            durationInFrames={durationInFrames}
            premountFor={fps}
          >
            <CaptionPage page={page} brand={brand} style={style} />
          </Sequence>
        );
      })}
    </>
  );
};
