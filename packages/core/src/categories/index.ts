export * from './seed-ca.js';
export {
  MAX_DEPTH,
  type CategoryNode,
  depthOf,
  wouldExceedDepth,
  assertDepthWithin,
  buildTree,
  rollup,
} from './tree.js';
export { mergeCategories, type MergeResult } from './merge.js';
