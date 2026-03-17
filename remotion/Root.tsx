import {Composition} from "remotion";

import {
  defaultNarratedVideoProps,
  calculateNarratedVideoMetadata,
  NarratedVideoCompositionPropsSchema,
  calculateSlidesVideoMetadata,
  defaultSlidesVideoProps,
  SlidesVideoCompositionPropsSchema,
} from "./types";
import {NarratedVideo} from "./compositions/NarratedVideo";
import {SlidesVideo} from "./compositions/SlidesVideo";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="NarratedVideo"
        component={NarratedVideo}
        schema={NarratedVideoCompositionPropsSchema}
        defaultProps={defaultNarratedVideoProps}
        durationInFrames={defaultNarratedVideoProps.config.totalDurationFrames}
        fps={defaultNarratedVideoProps.config.fps}
        width={defaultNarratedVideoProps.config.width}
        height={defaultNarratedVideoProps.config.height}
        calculateMetadata={calculateNarratedVideoMetadata}
      />
      <Composition
        id="SlidesVideo"
        component={SlidesVideo}
        schema={SlidesVideoCompositionPropsSchema}
        defaultProps={defaultSlidesVideoProps}
        durationInFrames={defaultSlidesVideoProps.config.totalDurationFrames}
        fps={defaultSlidesVideoProps.config.fps}
        width={defaultSlidesVideoProps.config.width}
        height={defaultSlidesVideoProps.config.height}
        calculateMetadata={calculateSlidesVideoMetadata}
      />
    </>
  );
};
