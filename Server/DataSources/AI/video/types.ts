export type LoopOptions = {
  frame: Buffer;
  mime: string;
  prompt: string;
  // 3 to 10 when the first and last frame are given.
  seconds: number;
  resolution: string;
};

export type GeneratedVideo = {
  buffer: Buffer;
  generator: string;
};
