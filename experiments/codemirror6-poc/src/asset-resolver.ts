import { URI, imageExtensions } from '@foam/core';

/**
 * Resolve a workspace-relative image path to a browser URL.
 *
 * This PoC maps Foam's virtual /notes workspace
 * to files served by Vite under public/notes.
 *
 * A non-null URL does NOT guarantee that the file exists.
 */
export function resolveLocalImageUrl(
  sourceUri: URI,
  rawPath: string
): string | null {
  const path = rawPath.trim();

  // Handle relative image paths only.
  if (!path.startsWith('./') && !path.startsWith('../')) {
    return null;
  }

  // Query strings and fragments are not supported yet.
  if (path.includes('?') || path.includes('#')) {
    return null;
  }

  // Reuse Foam's URI path operations.
  const targetUri = sourceUri.getDirectory().joinPath(path);

  const extension = targetUri.getExtension().toLowerCase();

  if (!imageExtensions.includes(extension)) {
    return null;
  }

  // Vite serves public/notes/... as /notes/...
  const url = new URL(targetUri.path, window.location.origin);

  // Restrict this PoC resolver to its sample workspace.
  if (!url.pathname.startsWith('/notes/')) {
    return null;
  }

  return url.href;
}
