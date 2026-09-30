import { compareTexts, type DiffRequest, type DiffResponse } from './diff.ts';

self.onmessage = ({ data }: MessageEvent<DiffRequest>) => {
  let response: DiffResponse;
  try {
    response = { id: data.id, result: compareTexts(data.original, data.changed) };
  } catch (error) {
    response = { id: data.id, error: error instanceof Error ? error.message : 'Comparison failed. Please try again.' };
  }
  self.postMessage(response);
};
