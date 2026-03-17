import {Composition} from "remotion";

import {
  defaultNarratedVideoProps,
  calculateNarratedVideoMetadata,
  NarratedVideoCompositionPropsSchema,
} from "./types";
import {NarratedVideo} from "./compositions/NarratedVideo";

export const RemotionRoot = () => {
  return (
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
  );
};
