import { Facet } from '@codemirror/state';
import type { URI } from '@foam/core';

/**
 * Identifies the note associated with an EditorState.
 *
 * Each note has its own EditorState and URI.
 */
export const noteUriFacet = Facet.define<URI, URI | null>({
  combine(values) {
    return values[0] ?? null;
  },
});
