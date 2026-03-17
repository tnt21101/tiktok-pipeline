import {Audio} from "@remotion/media";
import {TransitionSeries, linearTiming} from "@remotion/transitions";
import type {TransitionPresentation} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";
import {wipe} from "@remotion/transitions/wipe";
import {AbsoluteFill, Sequence} from "remotion";
import type {FC, ReactNode} from "react";

import type {NarratedClip, NarratedVideoCompositionProps} from "../types";
import {AnimatedCaption} from "./elements/AnimatedCaption";
import {BrandLowerThird} from "./elements/BrandLowerThird";
import {EndCard} from "./elements/EndCard";
import {SegmentLabel} from "./elements/SegmentLabel";
import {ProblemSolution} from "./templates/ProblemSolution";
import {Listicle} from "./templates/Listicle";
import {MythVsFact} from "./templates/MythVsFact";
import {BrandStory} from "./templates/BrandStory";
import {BeforeAfter} from "./templates/BeforeAfter";
import {QuickExplainer} from "./templates/QuickExplainer";
import {IngredientSpot} from "./templates/IngredientSpot";

const getTransitionPresentation = (
  clip: NarratedClip,
): TransitionPresentation<Record<string, unknown>> | null => {
  switch (clip.transition) {
    case "fade":
      return fade();
    case "slide-left":
      return slide({direction: "from-left"});
    case "slide-right":
      return slide({direction: "from-right"});
    case "wipe-left":
      return wipe({direction: "from-left"});
    case "wipe-right":
      return wipe({direction: "from-right"});
    default:
      return null;
  }
};

const ClipTemplate: FC<{
  config: NarratedVideoCompositionProps["config"];
  clip: NarratedClip;
}> = ({config, clip}) => {
  const props = {
    clip,
    brand: config.brand,
    visualIntensity: config.visualIntensity,
    platformPreset: config.platformPreset,
    kicker: config.title,
    eyebrow: config.brand.name,
  };

  switch (config.templateId) {
    case "listicle_countdown":
      return <Listicle {...props} />;
    case "myth_fact_stop_doing_this":
      return <MythVsFact {...props} />;
    case "storytelling_brand_origin":
      return <BrandStory {...props} />;
    case "before_after_transformation":
      return <BeforeAfter {...props} />;
    case "did_you_know_quick_explainer":
      return <QuickExplainer {...props} />;
    case "ingredient_spotlight":
      return <IngredientSpot {...props} />;
    default:
      return <ProblemSolution {...props} />;
  }
};

export const NarratedVideo: FC<NarratedVideoCompositionProps> = ({config}) => {
  const timelineChildren: ReactNode[] = [];

  config.clips.forEach((clip, index) => {
    timelineChildren.push(
      <TransitionSeries.Sequence
        key={`clip-${clip.segmentNumber}`}
        durationInFrames={clip.durationFrames}
      >
        <ClipTemplate config={config} clip={clip} />
      </TransitionSeries.Sequence>,
    );

    const presentation = getTransitionPresentation(clip);
    if (presentation) {
      timelineChildren.push(
        <TransitionSeries.Transition
          key={`transition-${clip.segmentNumber}`}
          presentation={presentation}
          timing={linearTiming({durationInFrames: clip.transitionDurationFrames})}
        />,
      );
    } else if (index < config.clips.length - 1 && clip.transitionDurationFrames > 0) {
      timelineChildren.push(
        <TransitionSeries.Transition
          key={`fallback-transition-${clip.segmentNumber}`}
          presentation={fade()}
          timing={linearTiming({durationInFrames: clip.transitionDurationFrames})}
        />,
      );
    }
  });

  if (config.overlays.endCard.enabled) {
    timelineChildren.push(
      <TransitionSeries.Sequence
        key="end-card"
        durationInFrames={config.overlays.endCard.durationFrames}
      >
        <EndCard
          brand={config.brand}
          ctaText={config.overlays.endCard.ctaText}
          productImageUrl={config.overlays.endCard.productImageUrl}
          gradient={config.overlays.endCard.backgroundGradient}
        />
      </TransitionSeries.Sequence>,
    );
  }

  return (
    <AbsoluteFill style={{backgroundColor: config.brand.primaryColor}}>
      <TransitionSeries>{timelineChildren}</TransitionSeries>

      {config.audio.segments.map((segment) => (
        <Sequence
          key={`audio-${segment.segmentNumber}`}
          from={segment.startFrame}
          durationInFrames={segment.durationFrames}
          premountFor={config.fps}
        >
          <Audio src={segment.audioUrl} />
        </Sequence>
      ))}

      {config.captions.enabled &&
        config.audio.segments.map((segment) => (
          <AnimatedCaption
            key={`captions-${segment.segmentNumber}`}
            captions={segment.captions}
            startFrame={segment.startFrame}
            brand={config.brand}
            style={config.captions}
          />
        ))}

      {config.overlays.lowerThird.enabled && (
        <Sequence
          from={config.overlays.lowerThird.showAtFrame}
          durationInFrames={
            config.overlays.lowerThird.hideAtFrame -
            config.overlays.lowerThird.showAtFrame
          }
          premountFor={config.fps}
        >
          <BrandLowerThird
            brand={config.brand}
            text={config.overlays.lowerThird.text}
          />
        </Sequence>
      )}

      {config.overlays.formatLabels.labels.map((label, index) => (
        <Sequence
          key={`label-${index}`}
          from={label.showAtFrame}
          durationInFrames={label.hideAtFrame - label.showAtFrame}
          premountFor={config.fps}
        >
          <SegmentLabel text={label.text} brand={config.brand} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
