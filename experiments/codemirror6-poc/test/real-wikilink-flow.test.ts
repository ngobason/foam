import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditorView as CodeMirrorView,
  type ViewUpdate,
} from '@codemirror/view';
import {
  StateEffect,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { FoamGraph, URI } from '@foam/core';
import {
  handleInternalLinkClick,
  realLinkNavigationContext,
} from '../src/internal-link-navigation';
import { noteUriFacet } from '../src/note-context';
import { BrowserNoteRepository } from '../src/browser-note-repository';
import { FoamCoreAdapter } from '../src/foam-core-adapter';

// Exercise main.ts's real dialog, repository, save and navigation wiring.
// Only the browser UI and EditorView rendering are replaced in this Node test.
const browser = vi.hoisted(() => {
  class Element {
    textContent = '';
    innerHTML = '';
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    children: Element[] = [];
    disabled = false;
    isConnected = false;
    value = '';
    id = '';
    className = '';
    attributes = new Map<string, string>();
    listeners = new Map<string, ((event: unknown) => unknown)[]>();
    classList = { toggle: vi.fn() };
    append(...nodes: Element[]) {
      this.children.push(...nodes);
    }
    appendChild(node: Element) {
      this.append(node);
      node.isConnected = true;
    }
    replaceChildren(...nodes: Element[]) {
      this.children = nodes;
    }
    addEventListener(type: string, listener: (event: unknown) => unknown) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    async click() {
      if (!this.disabled) {
        await Promise.all(
          (this.listeners.get('click') ?? []).map(fn => fn({}))
        );
      }
    }
    setAttribute(key: string, value: string) {
      this.attributes.set(key, value);
    }
    removeAttribute(key: string) {
      this.attributes.delete(key);
    }
    showModal() {
      this.isConnected = true;
    }
    close() {
      this.isConnected = false;
    }
    remove() {
      this.isConnected = false;
    }
  }
  const elements = new Map<string, Element>();
  for (const selector of [
    '#app',
    '#editor',
    '.topbar',
    '.workspace-actions',
    '.note-actions',
    '.developer-actions',
    '.panel-title',
    '.save-status',
    '#mvp-file-list',
  ]) {
    elements.set(selector, new Element());
  }
  const dialogs: Element[] = [];
  const body = new Element();
  const document = {
    body,
    documentElement: new Element(),
    querySelector: (selector: string) => elements.get(selector) ?? null,
    querySelectorAll: () =>
      elements
        .get('#mvp-file-list')!
        .children.filter(e => e.className === 'explorer-file'),
    createElement: (tag: string) => {
      const element = new Element();
      if (tag === 'dialog') dialogs.push(element);
      return element;
    },
  };
  const window = {
    location: { origin: 'http://localhost' },
    alert: vi.fn(),
    confirm: vi.fn(() => true),
    addEventListener: vi.fn(),
    showDirectoryPicker: vi.fn(),
  };
  const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  vi.stubGlobal('localStorage', storage);
  return { elements, dialogs, window, storage, editor: null as unknown };
});

vi.mock('codemirror', () => ({
  basicSetup: [],
  EditorView: class {
    static lineWrapping = CodeMirrorView.lineWrapping;
    static updateListener = CodeMirrorView.updateListener;
    static editable = CodeMirrorView.editable;
    static theme = CodeMirrorView.theme;
    state: EditorState;
    constructor(options: { state: EditorState }) {
      this.state = options.state;
      browser.editor = this;
    }
    setState(state: EditorState) {
      this.state = state;
    }
    dispatch(spec: TransactionSpec) {
      const startState = this.state;
      const transaction = startState.update(spec);
      this.state = transaction.state;
      for (const listener of this.state.facet(CodeMirrorView.updateListener)) {
        listener({
          view: this,
          state: this.state,
          startState,
          transactions: [transaction],
          docChanged: transaction.docChanged,
        } as unknown as ViewUpdate);
      }
    }
    plugin() {
      return this.state.facet(noteUriFacet)?.path.startsWith('/notes/')
        ? {}
        : null;
    }
    focus() {}
  },
}));

import '../src/main';

const editor = () =>
  browser.editor as {
    state: EditorState;
    setState(state: EditorState): void;
    dispatch(spec: TransactionSpec): void;
  };
const button = (name: string) =>
  ['.workspace-actions', '.note-actions', '.developer-actions']
    .flatMap(selector => browser.elements.get(selector)!.children)
    .find(e => e.textContent === name)!;
const dialogButton = (name: string) =>
  browser.dialogs
    .at(-1)!
    .children.at(-1)!
    .children.find(e => e.textContent === name)!;
const waitForDialog = async () => {
  await vi.waitFor(() =>
    expect(browser.dialogs.at(-1)?.children[0]?.textContent).toBe(
      'Unsaved Changes'
    )
  );
};

async function returnToSampleForTest() {
  const pendingDialog = browser.dialogs.findLast(
    dialog =>
      dialog.isConnected &&
      dialog.children[0]?.textContent === 'Unsaved Changes'
  );
  if (pendingDialog) {
    await pendingDialog.children
      .at(-1)!
      .children.find(e => e.textContent === 'Cancel')!
      .click();
    await vi.waitFor(() =>
      expect(
        editor().state.facet(realLinkNavigationContext)?.canNavigate() ?? true
      ).toBe(true)
    );
  }
  let finished = false;
  const leaving = button('Return to Sample')
    .click()
    .then(() => {
      finished = true;
    });
  await vi.waitFor(() =>
    expect(
      finished ||
        browser.dialogs.some(
          dialog =>
            dialog.isConnected &&
            dialog.children[0]?.textContent === 'Unsaved Changes'
        )
    ).toBe(true)
  );
  if (!finished) {
    await dialogButton(
      browser.elements
        .get('.save-status')!
        .textContent.includes('Core sync failed')
        ? 'Save'
        : 'Discard'
    ).click();
  }
  await leaving;
}

async function openWorkspace(
  dirty = true,
  permission: PermissionState = 'granted'
) {
  await returnToSampleForTest();
  const files = new Map([
    ['A.md', '[[B|Label]]\n[[Missing]]'],
    ['B.md', '# B'],
  ]);
  const read = vi.fn(async (name: string) => files.get(name)!);
  const write = vi.fn(async (name: string, content: string) => {
    files.set(name, content);
  });
  const requestPermission = vi.fn(async () => permission);
  const createWritable = vi.fn(async (name: string) => ({
    write: (content: string) => write(name, content),
    close: async () => {},
    abort: async () => {},
  }));
  const directory = {
    name: 'Test workspace',
    requestPermission,
    async *entries() {
      for (const name of files.keys())
        yield [name, await this.getFileHandle(name)];
    },
    async getFileHandle(name: string) {
      if (!files.has(name)) throw new Error('File not found');
      return {
        kind: 'file',
        getFile: async () => ({ text: () => read(name) }),
        createWritable: () => createWritable(name),
      };
    },
  };
  browser.window.showDirectoryPicker.mockResolvedValue(directory);
  await button('List Markdown Notes').click();
  await browser.elements
    .get('#mvp-file-list')!
    .children.find(e => e.dataset.noteName === 'A.md')!
    .click();
  await button('Edit Real File').click();
  if (dirty)
    editor().setState(
      editor().state.update({
        changes: { from: 0, insert: 'Unsaved [[MissingUnsaved]]\n' },
        selection: { anchor: 2 },
      }).state
    );
  browser.storage.getItem.mockClear();
  browser.storage.setItem.mockClear();
  browser.window.alert.mockClear();
  const state = editor().state;
  const context = state.facet(realLinkNavigationContext)!;
  return {
    files,
    read,
    write,
    state,
    context,
    requestPermission,
    createWritable,
    directory,
    adapter: context.adapter!,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await returnToSampleForTest();
  vi.useRealTimers();
});

function editText(content: string) {
  editor().dispatch({
    changes: { from: 0, to: editor().state.doc.length, insert: content },
  });
}

function pendingWrite() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe('real Wikilink dialog and safe save wiring', () => {
  it('shows Save only while editing a real file', async () => {
    expect(button('Save Real File').style.display).toBe('none');
    const { context } = await openWorkspace(false);
    expect(button('Save Real File').style.display).toBe('inline-block');

    context.openNote(URI.file('/real-notes/B.md'));
    await vi.waitFor(() =>
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md')
    );
    expect(button('Save Real File').style.display).toBe('none');
    expect(button('Edit Real File').style.display).toBe('inline-block');

    await button('Return to Sample').click();
    expect(button('Save Real File').style.display).toBe('none');
  });

  it.each(['Save', 'Discard', 'Cancel'])(
    '%s preserves the intended disk and Core state',
    async decision => {
      const { files, write, state, context, adapter, requestPermission } =
        await openWorkspace(true, 'denied');
      const original = files.get('A.md');
      const graph = FoamGraph.fromWorkspace(adapter.workspace, true);
      const originalLinks = graph.getLinks(URI.file('/real-notes/A.md')).length;
      context.openNote(URI.file('/real-notes/B.md'));
      await waitForDialog();
      expect(context.canNavigate()).toBe(false);
      // Repeated operations cannot replace this pending navigation.
      context.openNote(URI.file('/real-notes/A.md'));
      await button('Return to Sample').click();
      await button('List Markdown Notes').click();
      expect(editor().state).toBe(state);
      requestPermission.mockResolvedValue('granted');
      await dialogButton(decision).click();
      await vi.waitFor(() => expect(context.canNavigate()).toBe(true));
      if (decision === 'Cancel') {
        expect(editor().state).toBe(state);
      } else {
        expect(editor().state.facet(noteUriFacet)?.path).toBe(
          '/real-notes/B.md'
        );
        expect(editor().state.readOnly).toBe(true);
        expect(
          browser.elements
            .get('#mvp-file-list')!
            .children.find(e => e.dataset.noteName === 'B.md')!
            .attributes.get('aria-current')
        ).toBe('page');
      }
      expect(files.get('A.md')).toBe(
        decision === 'Save' ? state.doc.toString() : original
      );
      expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
        files.get('A.md')
      );
      expect(write).toHaveBeenCalledTimes(decision === 'Save' ? 1 : 0);
      expect(graph.getLinks(URI.file('/real-notes/A.md'))).toHaveLength(
        originalLinks + (decision === 'Save' ? 1 : 0)
      );
      graph.dispose();
      expect(browser.storage.getItem).not.toHaveBeenCalled();
      expect(browser.storage.setItem).not.toHaveBeenCalled();
    }
  );

  it.each(['conflict', 'I/O'])(
    'keeps the dialog and editor after Save %s failure',
    async failure => {
      const { files, write, state, context, adapter, requestPermission } =
        await openWorkspace(true, 'denied');
      const original = files.get('A.md');
      if (failure === 'conflict') files.set('A.md', 'External changes');
      else write.mockRejectedValueOnce(new Error('Disk write failed'));
      context.openNote(URI.file('/real-notes/B.md'));
      await waitForDialog();
      requestPermission.mockResolvedValue('granted');
      await dialogButton('Save').click();
      expect(editor().state).toBe(state);
      expect(browser.dialogs.at(-1)!.isConnected).toBe(true);
      expect(dialogButton('Save').disabled).toBe(false);
      expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(original);
      expect(files.get('A.md')).toBe(
        failure === 'conflict' ? 'External changes' : original
      );
      expect(browser.window.alert).toHaveBeenCalledWith(
        expect.stringContaining(
          failure === 'conflict' ? 'modified outside' : 'Disk write failed'
        )
      );
      await dialogButton('Cancel').click();
      await vi.waitFor(() => expect(context.canNavigate()).toBe(true));
      expect(editor().state).toBe(state);
    }
  );

  it('navigates clean notes without a prompt', async () => {
    const { context } = await openWorkspace(false);
    const dialogCount = browser.dialogs.length;
    context.openNote(URI.file('/real-notes/B.md'));
    await vi.waitFor(() =>
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md')
    );
    expect(browser.dialogs).toHaveLength(dialogCount);
  });

  it('does not prompt or discard when the target has disappeared from disk', async () => {
    const { context, files, state, write } = await openWorkspace();
    files.delete('B.md');
    const dialogCount = browser.dialogs.length;
    context.openNote(URI.file('/real-notes/B.md'));
    await vi.waitFor(() =>
      expect(browser.window.alert).toHaveBeenCalledWith('File not found')
    );
    expect(browser.dialogs).toHaveLength(dialogCount);
    expect(editor().state).toBe(state);
    expect(write).not.toHaveBeenCalled();
  });

  it('ignores repeated clicks during Save and waits for disk completion', async () => {
    const { context, write, state, requestPermission } = await openWorkspace(
      true,
      'denied'
    );
    let finishWrite!: () => void;
    write.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finishWrite = resolve;
        })
    );
    context.openNote(URI.file('/real-notes/B.md'));
    await waitForDialog();
    requestPermission.mockResolvedValue('granted');
    const saving = dialogButton('Save').click();
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    context.openNote(URI.file('/real-notes/B.md'));
    await browser.elements
      .get('#mvp-file-list')!
      .children.find(e => e.dataset.noteName === 'A.md')!
      .click();
    expect(editor().state).toBe(state);
    expect(dialogButton('Saving...').disabled).toBe(true);
    finishWrite();
    await saving;
    await vi.waitFor(() =>
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md')
    );
    expect(write).toHaveBeenCalledOnce();
  });

  it('preserves newer edits made during a pending target read', async () => {
    const { context, read, write, state } = await openWorkspace();
    let finishRead!: (content: string) => void;
    read.mockImplementationOnce(
      () =>
        new Promise<string>(resolve => {
          finishRead = resolve;
        })
    );
    context.openNote(URI.file('/real-notes/B.md'));
    await vi.waitFor(() => expect(finishRead).toBeTypeOf('function'));
    const newerState = state.update({
      changes: { from: 0, insert: 'More edits\n' },
    }).state;
    editor().setState(newerState);
    finishRead('# B');
    await vi.waitFor(() => expect(context.canNavigate()).toBe(true));
    expect(editor().state).toBe(newerState);
    expect(write).not.toHaveBeenCalled();
  });
});

const explorerFile = (name: string) =>
  browser.elements
    .get('#mvp-file-list')!
    .children.find(e => e.dataset.noteName === name)!;
const pickerOpenNote = (name: string) => {
  const picker = browser.dialogs.findLast(
    dialog => dialog.id === 'mvp-note-preview'
  )!;
  picker.children[1].value = name;
  return picker.children.find(
    element => element.textContent === 'Open in CodeMirror'
  )!;
};

function clickRealWikilink(raw = '[[B', modifier = 'ctrlKey') {
  class ClickNode {}
  vi.stubGlobal('Node', ClickNode);
  return handleInternalLinkClick(
    {
      button: 0,
      ctrlKey: modifier === 'ctrlKey',
      metaKey: modifier === 'metaKey',
      target: new ClickNode(),
      preventDefault: vi.fn(),
    } as unknown as MouseEvent,
    {
      state: editor().state,
      contentDOM: { contains: () => true },
      posAtCoords: () => editor().state.doc.toString().indexOf(raw) + 2,
    } as unknown as CodeMirrorView
  );
}

describe.each(['Wikilink', 'Sample'])('%s T2b automatic navigation', path => {
  const navigate = (raw = '[[B', modifier = 'ctrlKey') => {
    if (path === 'Sample') return button('Return to Sample').click();
    clickRealWikilink(raw, modifier);
    return Promise.resolve();
  };
  const targetPath =
    path === 'Sample' ? '/notes/Welcome.md' : '/real-notes/B.md';

  it('flushes pending edits and Core before leaving without a dialog or redundant permission request', async () => {
    const { files, write, adapter, requestPermission } = await openWorkspace(
      false
    );
    vi.useFakeTimers();
    requestPermission.mockClear();
    const count = browser.dialogs.length;
    editText('T2b pending [[B|Label]]');
    const leaving = navigate();
    await vi.advanceTimersByTimeAsync(0);
    expect(editor().state.facet(noteUriFacet)?.path).toBe(targetPath);
    await leaving;
    expect(files.get('A.md')).toBe('T2b pending [[B|Label]]');
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
      files.get('A.md')
    );
    expect(write).toHaveBeenCalledTimes(1);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(browser.dialogs).toHaveLength(count);
    expect(browser.storage.setItem).not.toHaveBeenCalled();
  });

  it('requests fresh permission in the original click before target reads', async () => {
    const { requestPermission, read } = await openWorkspace(false, 'denied');
    vi.useFakeTimers();
    editText('Need access [[B]]');
    requestPermission.mockClear();
    read.mockClear();
    requestPermission.mockResolvedValue('granted');
    const leaving = navigate();
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    await leaving;
    expect(editor().state.facet(noteUriFacet)?.path).toBe(targetPath);
  });

  it('awaits manual Save and drains newer edits before replacing the source', async () => {
    const { files, write, adapter, requestPermission } = await openWorkspace(
      false
    );
    vi.useFakeTimers();
    const gate = pendingWrite();
    write.mockImplementationOnce(async (name, content) => {
      await gate.promise;
      files.set(name, content);
    });
    editText('Snapshot [[B]]');
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    editText('Newer [[B]]');
    requestPermission.mockClear();
    const leaving = navigate();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
      expect(write).toHaveBeenCalledTimes(1);
      editText('Latest [[B]]');
    } finally {
      gate.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    await leaving;
    expect(files.get('A.md')).toBe('Latest [[B]]');
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe('Latest [[B]]');
    expect(editor().state.facet(noteUriFacet)?.path).toBe(targetPath);
    expect(write).toHaveBeenCalledTimes(2);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('leaves clean sources without writes, permission requests or a dialog', async () => {
    const { write, requestPermission } = await openWorkspace(false);
    vi.useFakeTimers();
    requestPermission.mockClear();
    const count = browser.dialogs.length;
    const leaving = navigate();
    await vi.advanceTimersByTimeAsync(0);
    await leaving;
    expect(editor().state.facet(noteUriFacet)?.path).toBe(targetPath);
    expect(write).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(browser.dialogs).toHaveLength(count);
  });

  it.each(['\n', '\r\n'])(
    'preserves %j source line endings and aliases',
    async separator => {
      const { files, write, adapter } = await openWorkspace(false);
      files.set('A.md', ['# A', '[[B|Label]]'].join(separator));
      await explorerFile('A.md').click();
      await button('Edit Real File').click();
      vi.useFakeTimers();
      editText('# Edited\n[[B|Label]]');
      const leaving = navigate('[[B', 'metaKey');
      await vi.advanceTimersByTimeAsync(0);
      await leaving;
      const content = ['# Edited', '[[B|Label]]'].join(separator);
      expect(files.get('A.md')).toBe(content);
      expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(content);
      expect(write).toHaveBeenCalledExactlyOnceWith('A.md', content);
      expect(editor().state.facet(noteUriFacet)?.path).toBe(targetPath);
    }
  );

  it.each(['conflict', 'I/O', 'Core'])(
    'preserves the source on %s failure and uses safe fallback',
    async failure => {
      const { files, write, adapter } = await openWorkspace(false);
      vi.useFakeTimers();
      const original = files.get('A.md');
      editText('Fallback draft [[B]]');
      const source = editor().state;
      if (failure === 'conflict') files.set('A.md', 'External A');
      if (failure === 'I/O')
        write.mockRejectedValueOnce(new Error('I/O failure'));
      if (failure === 'Core')
        vi.spyOn(adapter, 'updateNote').mockImplementationOnce(() => {
          throw new Error('Core failure');
        });
      const leaving = navigate();
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      expect(editor().state).toBe(source);
      expect(files.get('A.md')).toBe(
        failure === 'Core'
          ? 'Fallback draft [[B]]'
          : failure === 'conflict'
          ? 'External A'
          : original
      );
      expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(original);
      await dialogButton('Save').click();
      if (failure === 'conflict') {
        expect(editor().state).toBe(source);
        expect(write).not.toHaveBeenCalled();
        await dialogButton('Cancel').click();
        await leaving;
        await vi.advanceTimersByTimeAsync(1000);
        expect(files.get('A.md')).toBe('External A');
      } else {
        await vi.advanceTimersByTimeAsync(0);
        await leaving;
        expect(editor().state.facet(noteUriFacet)?.path).toBe(targetPath);
        expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
          'Fallback draft [[B]]'
        );
        expect(write).toHaveBeenCalledTimes(failure === 'Core' ? 1 : 2);
      }
    }
  );

  it('keeps denied drafts on Cancel, permits a manual retry and resumes later Auto-save', async () => {
    const { files, write, requestPermission } = await openWorkspace(
      false,
      'denied'
    );
    vi.useFakeTimers();
    editText('Denied [[B]]');
    const source = editor().state;
    const original = files.get('A.md');
    const leaving = navigate();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    await dialogButton('Cancel').click();
    await leaving;
    await vi.advanceTimersByTimeAsync(1000);
    expect(editor().state).toBe(source);
    expect(files.get('A.md')).toBe(original);
    expect(write).not.toHaveBeenCalled();
    expect(requestPermission).toHaveBeenCalledTimes(2);
    requestPermission.mockResolvedValue('granted');
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    editText('After retry [[B]]');
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('After retry [[B]]');
    expect(requestPermission).toHaveBeenCalledTimes(3);
    const retry = navigate();
    await vi.advanceTimersByTimeAsync(0);
    await retry;
    expect(editor().state.facet(noteUriFacet)?.path).toBe(targetPath);
  });

  it('falls back after revocation and retries only from a Save gesture', async () => {
    const { files, createWritable, requestPermission } = await openWorkspace(
      false
    );
    vi.useFakeTimers();
    editText('Revoked [[B]]');
    const source = editor().state;
    createWritable.mockRejectedValueOnce(
      new DOMException('Revoked', 'NotAllowedError')
    );
    requestPermission.mockClear();
    const leaving = navigate();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    expect(editor().state).toBe(source);
    expect(requestPermission).not.toHaveBeenCalled();
    await dialogButton('Save').click();
    await vi.advanceTimersByTimeAsync(0);
    await leaving;
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(files.get('A.md')).toBe('Revoked [[B]]');
    expect(editor().state.facet(noteUriFacet)?.path).toBe(targetPath);
  });

  it.each(['active write', 'next revision'])(
    'EDGE-GATE preserves newer edits when permission fails during %s',
    async failureAt => {
      const { files, write, adapter, createWritable, requestPermission } =
        await openWorkspace(false);
      vi.useFakeTimers();
      const original = files.get('A.md');
      const gate = pendingWrite();
      const revoked = new DOMException('Permission revoked', 'NotAllowedError');
      write.mockImplementationOnce(async (name, content) => {
        await gate.promise;
        if (failureAt === 'active write') throw revoked;
        files.set(name, content);
      });
      editText('In-flight snapshot [[B]]');
      await vi.advanceTimersByTimeAsync(750);
      expect(write).toHaveBeenCalledTimes(1);
      if (failureAt === 'next revision')
        createWritable.mockRejectedValueOnce(revoked);
      requestPermission.mockClear();
      requestPermission.mockResolvedValue('denied');
      editText('Newer pending [[B]]');
      const leaving = navigate();
      try {
        await vi.advanceTimersByTimeAsync(0);
        editText('Latest race draft [[B]]');
        expect(editor().state.facet(noteUriFacet)?.path).toBe(
          '/real-notes/A.md'
        );
        expect(write).toHaveBeenCalledTimes(1);
        expect(requestPermission).not.toHaveBeenCalled();
      } finally {
        gate.resolve();
        await vi.advanceTimersByTimeAsync(0);
      }
      await waitForDialog();
      const source = editor().state;
      const baseline =
        failureAt === 'active write' ? original : 'In-flight snapshot [[B]]';
      expect(source.doc.toString()).toBe('Latest race draft [[B]]');
      expect(files.get('A.md')).toBe(baseline);
      expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(baseline);
      expect(requestPermission).not.toHaveBeenCalled();
      await dialogButton('Cancel').click();
      await leaving;
      await vi.advanceTimersByTimeAsync(1000);
      expect(editor().state).toBe(source);
      expect(write).toHaveBeenCalledTimes(1);
      expect(requestPermission).not.toHaveBeenCalled();

      // Revocation invalidated cached access. The next request must start
      // synchronously inside the navigation click, not after a read or timer.
      let inGesture = true;
      requestPermission.mockImplementation(async () => {
        expect(inGesture).toBe(true);
        return 'denied';
      });
      const retry = navigate();
      inGesture = false;
      expect(requestPermission).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      expect(editor().state).toBe(source);
      expect(files.get('A.md')).toBe(baseline);
      expect(write).toHaveBeenCalledTimes(1);
      requestPermission.mockImplementation(async () => {
        expect(inGesture).toBe(true);
        return 'granted';
      });
      inGesture = true;
      const saving = dialogButton('Save').click();
      inGesture = false;
      expect(requestPermission).toHaveBeenCalledTimes(2);
      await saving;
      await vi.advanceTimersByTimeAsync(0);
      await retry;
      expect(editor().state.facet(noteUriFacet)?.path).toBe(targetPath);
      expect(files.get('A.md')).toBe('Latest race draft [[B]]');
      expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
        'Latest race draft [[B]]'
      );
      expect(write).toHaveBeenCalledTimes(2);
      expect(createWritable).toHaveBeenCalledTimes(
        failureAt === 'active write' ? 2 : 3
      );
      expect(browser.storage.setItem).not.toHaveBeenCalled();
    }
  );

  it('leaves mixed-line-ending read-only notes without requesting permission', async () => {
    const { files, write, requestPermission } = await openWorkspace(false);
    files.set('B.md', '# B\r\nMixed\n[[A]]');
    await explorerFile('B.md').click();
    vi.useFakeTimers();
    requestPermission.mockClear();
    const leaving = navigate('[[A');
    await vi.advanceTimersByTimeAsync(0);
    await leaving;
    expect(editor().state.facet(noteUriFacet)?.path).toBe(
      path === 'Wikilink' ? '/real-notes/A.md' : targetPath
    );
    expect(files.get('B.md')).toBe('# B\r\nMixed\n[[A]]');
    expect(write).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('rejects stale source state during permission preflight and resumes the newer draft', async () => {
    const { files, requestPermission } = await openWorkspace(false, 'denied');
    vi.useFakeTimers();
    const gate = pendingWrite();
    requestPermission.mockImplementationOnce(async () => {
      await gate.promise;
      return 'granted';
    });
    editText('Before access [[B]]');
    const leaving = navigate();
    editText('Changed during access [[B]]');
    const newer = editor().state;
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await leaving;
    expect(editor().state).toBe(newer);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('Changed during access [[B]]');
  });

  it('writes subsequent Sample edits only to localStorage', async () => {
    const { files, write } = await openWorkspace(false);
    vi.useFakeTimers();
    editText('Real file before Sample [[B]]');
    const leaving = navigate();
    await vi.advanceTimersByTimeAsync(0);
    await leaving;
    if (path === 'Wikilink') await button('Return to Sample').click();
    const content = editor().state.doc.toString() + '\nSample-only edit';
    editText(content);
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledExactlyOnceWith(
      'A.md',
      'Real file before Sample [[B]]'
    );
    expect(files.get('B.md')).toBe('# B');
    expect(browser.storage.setItem).toHaveBeenCalledWith(
      'foam-editor-poc-note:file:///notes/Welcome.md',
      content
    );
  });
});

describe('T2b Wikilink target guards', () => {
  it.each(['[[Missing]]', '[[B#Heading]]', '[B](B.md)'])(
    'does not save or request permission for unresolved/unsupported %s',
    async markdown => {
      const { write, requestPermission } = await openWorkspace(false, 'denied');
      vi.useFakeTimers();
      editText(markdown);
      const source = editor().state;
      requestPermission.mockClear();
      clickRealWikilink(markdown);
      await vi.advanceTimersByTimeAsync(0);
      expect(editor().state).toBe(source);
      expect(write).not.toHaveBeenCalled();
      expect(requestPermission).not.toHaveBeenCalled();
    }
  );

  it.each(['missing', 'newer draft', 'changed target'])(
    'revalidates a target after successful flush: %s',
    async change => {
      const { files, write, read, adapter } = await openWorkspace(false);
      vi.useFakeTimers();
      const gate = pendingWrite();
      const readFile = read.getMockImplementation()!;
      let targetReads = 0;
      read.mockImplementation(async name => {
        if (name === 'B.md' && ++targetReads === 2) await gate.promise;
        return readFile(name);
      });
      write.mockImplementationOnce(async (name, content) => {
        files.set(name, content);
        if (change === 'missing') files.delete('B.md');
      });
      editText('Flushed before re-read [[B]]');
      const source = editor().state;
      clickRealWikilink();
      await vi.advanceTimersByTimeAsync(0);
      try {
        expect(files.get('A.md')).toBe('Flushed before re-read [[B]]');
        expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
          files.get('A.md')
        );
        if (change === 'newer draft') editText('Newer after flush [[B]]');
        if (change === 'changed target') files.set('B.md', '# Current B');
      } finally {
        gate.resolve();
        await vi.advanceTimersByTimeAsync(0);
      }
      if (change === 'changed target') {
        expect(editor().state.facet(noteUriFacet)?.path).toBe(
          '/real-notes/B.md'
        );
        expect(editor().state.doc.toString()).toBe('# Current B');
      } else {
        expect(editor().state.facet(noteUriFacet)?.path).toBe(
          '/real-notes/A.md'
        );
        if (change === 'missing') {
          expect(editor().state).toBe(source);
          expect(browser.window.alert).toHaveBeenCalledWith('File not found');
          editText('Still active after missing target [[B]]');
        }
        const draft = editor().state.doc.toString();
        await vi.advanceTimersByTimeAsync(750);
        expect(files.get('A.md')).toBe(draft);
      }
    }
  );
});

describe('T2c conditional workspace switching', () => {
  const selectNextWorkspace = (
    source: Awaited<ReturnType<typeof openWorkspace>>,
    permission: PermissionState | null = 'granted'
  ) => {
    const queryPermission = vi.fn(async () => permission as PermissionState);
    if (permission !== null)
      Object.assign(source.directory, { queryPermission });
    const target = { ...source.directory, name: 'Next workspace' };
    browser.window.showDirectoryPicker.mockResolvedValue(target);
    return { queryPermission, target };
  };

  it('automatically persists with already-granted permission after selecting the target folder', async () => {
    const { directory, files, write, adapter, requestPermission } =
      await openWorkspace(false);
    const queryPermission = vi.fn(async () => 'granted' as PermissionState);
    Object.assign(directory, { queryPermission });
    const target = { ...directory, name: 'Next workspace' };
    browser.window.showDirectoryPicker.mockResolvedValue(target);
    vi.useFakeTimers();
    editText('Workspace draft [[B]]');
    requestPermission.mockClear();
    const count = browser.dialogs.length;
    const switching = button('List Markdown Notes').click();
    expect(queryPermission).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(files.get('A.md')).toBe('Workspace draft [[B]]');
    await switching;
    expect(queryPermission).toHaveBeenCalledExactlyOnceWith({
      mode: 'readwrite',
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    expect(browser.dialogs).toHaveLength(count + 1); // The new Markdown picker only.
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/notes/Welcome.md');
    await explorerFile('A.md').click();
    expect(editor().state.doc.toString()).toBe('Workspace draft [[B]]');
    expect(editor().state.facet(realLinkNavigationContext)?.adapter).not.toBe(
      adapter
    );
  });

  it.each([false, true])(
    'preserves the source when the folder picker is cancelled; dirty=%s',
    async dirty => {
      const { directory, files, write, requestPermission, context } =
        await openWorkspace(false);
      const queryPermission = vi.fn(async () => 'granted' as PermissionState);
      Object.assign(directory, { queryPermission });
      vi.useFakeTimers();
      const original = files.get('A.md');
      if (dirty) editText('Pending before cancel [[B]]');
      const source = editor().state;
      const count = browser.dialogs.length;
      requestPermission.mockClear();
      browser.window.showDirectoryPicker.mockRejectedValueOnce(
        new DOMException('Cancelled', 'AbortError')
      );
      await button('List Markdown Notes').click();
      expect(editor().state).toBe(source);
      expect(editor().state.facet(realLinkNavigationContext)?.adapter).toBe(
        context.adapter
      );
      expect(files.get('A.md')).toBe(original);
      expect(write).not.toHaveBeenCalled();
      expect(requestPermission).not.toHaveBeenCalled();
      expect(queryPermission).not.toHaveBeenCalled();
      expect(browser.dialogs).toHaveLength(count);
      if (dirty) {
        await vi.advanceTimersByTimeAsync(750);
        expect(files.get('A.md')).toBe('Pending before cancel [[B]]');
      }
    }
  );

  it.each(['Save', 'Discard', 'Cancel'])(
    'uses %s fallback when permission needs a fresh gesture',
    async decision => {
      const source = await openWorkspace(false);
      const { queryPermission } = selectNextWorkspace(source, 'prompt');
      vi.useFakeTimers();
      const original = source.files.get('A.md');
      editText('Gesture-required draft [[B]]');
      const state = editor().state;
      source.requestPermission.mockClear();
      const switching = button('List Markdown Notes').click();
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      expect(queryPermission).toHaveBeenCalledTimes(1);
      expect(source.requestPermission).not.toHaveBeenCalled();
      expect(source.write).not.toHaveBeenCalled();
      let inGesture = true;
      source.requestPermission.mockImplementation(async () => {
        expect(inGesture).toBe(true);
        return 'granted';
      });
      const choosing = dialogButton(decision).click();
      inGesture = false;
      expect(source.requestPermission).toHaveBeenCalledTimes(
        decision === 'Save' ? 1 : 0
      );
      await choosing;
      await switching;
      await vi.advanceTimersByTimeAsync(1000);
      expect(source.files.get('A.md')).toBe(
        decision === 'Save' ? 'Gesture-required draft [[B]]' : original
      );
      expect(source.write).toHaveBeenCalledTimes(decision === 'Save' ? 1 : 0);
      expect(editor().state === state).toBe(decision === 'Cancel');
      expect(browser.storage.setItem).not.toHaveBeenCalled();
      source.requestPermission.mockResolvedValue('granted');
    }
  );

  it.each(['denied', 'unavailable', 'error'])(
    'falls back without trusting cached permission when query is %s',
    async state => {
      const source = await openWorkspace(false);
      const { queryPermission } = selectNextWorkspace(
        source,
        state === 'denied' ? 'denied' : state === 'error' ? 'granted' : null
      );
      if (state === 'error')
        queryPermission.mockRejectedValue(new Error('Query unsupported'));
      vi.useFakeTimers();
      editText('Uncertain permission [[B]]');
      const original = source.files.get('A.md');
      const editorState = editor().state;
      source.requestPermission.mockClear();
      const switching = button('List Markdown Notes').click();
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      expect(source.write).not.toHaveBeenCalled();
      expect(source.requestPermission).not.toHaveBeenCalled();
      await dialogButton('Cancel').click();
      await switching;
      expect(editor().state).toBe(editorState);
      expect(source.files.get('A.md')).toBe(original);
    }
  );

  it('drains an in-flight manual Save and newer revisions before switching', async () => {
    const source = await openWorkspace(false);
    selectNextWorkspace(source);
    vi.useFakeTimers();
    const gate = pendingWrite();
    source.write.mockImplementationOnce(async (name, content) => {
      await gate.promise;
      source.files.set(name, content);
    });
    editText('Snapshot [[B]]');
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    editText('Newer workspace revision [[B]]');
    source.requestPermission.mockClear();
    const switching = button('List Markdown Notes').click();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(source.write).toHaveBeenCalledTimes(1);
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
      editText('Latest workspace revision [[B]]');
    } finally {
      gate.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    await switching;
    expect(source.files.get('A.md')).toBe('Latest workspace revision [[B]]');
    expect(source.write).toHaveBeenCalledTimes(2);
    expect(source.requestPermission).not.toHaveBeenCalled();
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/notes/Welcome.md');
    await explorerFile('A.md').click();
    expect(editor().state.doc.toString()).toBe(
      'Latest workspace revision [[B]]'
    );
  });

  it.each(['conflict', 'permission', 'I/O', 'Core'])(
    'retains source and offers fallback after automatic %s failure',
    async failure => {
      const source = await openWorkspace(false);
      selectNextWorkspace(source);
      vi.useFakeTimers();
      editText('Failed workspace draft [[B]]');
      const state = editor().state;
      const dispose = vi.spyOn(source.adapter.workspace, 'dispose');
      if (failure === 'conflict') source.files.set('A.md', 'External A');
      if (failure === 'permission')
        source.createWritable.mockRejectedValueOnce(
          new DOMException('Revoked', 'NotAllowedError')
        );
      if (failure === 'I/O')
        source.write.mockRejectedValueOnce(new Error('Disk failure'));
      if (failure === 'Core')
        vi.spyOn(source.adapter, 'updateNote').mockImplementationOnce(() => {
          throw new Error('Core failure');
        });
      source.requestPermission.mockClear();
      const switching = button('List Markdown Notes').click();
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      expect(editor().state).toBe(state);
      expect(dispose).not.toHaveBeenCalled();
      expect(source.requestPermission).not.toHaveBeenCalled();
      if (failure === 'Core') {
        expect(source.files.get('A.md')).toBe('Failed workspace draft [[B]]');
        await dialogButton('Save').click();
        await switching;
        expect(source.write).toHaveBeenCalledTimes(1);
        expect(source.requestPermission).not.toHaveBeenCalled();
      } else {
        await dialogButton('Cancel').click();
        await switching;
        expect(editor().state).toBe(state);
        expect(dispose).not.toHaveBeenCalled();
        if (failure === 'conflict')
          expect(source.files.get('A.md')).toBe('External A');
      }
    }
  );

  it.each(['load', 'Core init'])(
    'keeps the source workspace alive on target %s failure',
    async failure => {
      const source = await openWorkspace(false);
      const { target } = selectNextWorkspace(source);
      vi.useFakeTimers();
      editText('Do not lose this draft [[B]]');
      const state = editor().state;
      const dispose = vi.spyOn(source.adapter.workspace, 'dispose');
      if (failure === 'load')
        vi.spyOn(target, 'entries').mockImplementation(async function* () {
          throw new Error('Cannot read folder');
        });
      if (failure === 'Core init')
        vi.spyOn(
          FoamCoreAdapter,
          'createFromMarkdownFiles'
        ).mockRejectedValueOnce(new Error('Cannot initialize Core'));
      await button('List Markdown Notes').click();
      expect(editor().state).toBe(state);
      expect(editor().state.facet(realLinkNavigationContext)?.adapter).toBe(
        source.adapter
      );
      expect(dispose).not.toHaveBeenCalled();
      editText('Still editable after target failure [[B]]');
      await vi.advanceTimersByTimeAsync(750);
      expect(source.files.get('A.md')).toBe(
        'Still editable after target failure [[B]]'
      );
    }
  );

  it('retries Core-only synchronization without querying permission or rewriting disk', async () => {
    const source = await openWorkspace(false);
    const { queryPermission } = selectNextWorkspace(source, 'denied');
    vi.useFakeTimers();
    vi.spyOn(source.adapter, 'updateNote').mockImplementationOnce(() => {
      throw new Error('Core unavailable');
    });
    editText('Disk persisted before switch [[B]]');
    await vi.advanceTimersByTimeAsync(750);
    source.requestPermission.mockClear();
    await button('List Markdown Notes').click();
    expect(queryPermission).not.toHaveBeenCalled();
    expect(source.requestPermission).not.toHaveBeenCalled();
    expect(source.write).toHaveBeenCalledTimes(1);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/notes/Welcome.md');
  });

  it('switches mixed read-only notes without write access and keeps Sample edits isolated', async () => {
    const source = await openWorkspace(false);
    source.files.set('B.md', '# Mixed\r\nLF\nEnd');
    await explorerFile('B.md').click();
    const { queryPermission } = selectNextWorkspace(source, 'denied');
    source.requestPermission.mockClear();
    await button('List Markdown Notes').click();
    expect(queryPermission).not.toHaveBeenCalled();
    expect(source.requestPermission).not.toHaveBeenCalled();
    expect(source.write).not.toHaveBeenCalled();
    editText(
      editor().state.doc.toString() + '\nSample only after workspace switch'
    );
    expect(browser.storage.setItem).toHaveBeenCalled();
    expect(source.files.get('B.md')).toBe('# Mixed\r\nLF\nEnd');
  });

  it('switches a clean editable source without querying or requesting write permission', async () => {
    const source = await openWorkspace(false);
    const { queryPermission } = selectNextWorkspace(source, 'denied');
    source.requestPermission.mockClear();
    await button('List Markdown Notes').click();
    expect(queryPermission).not.toHaveBeenCalled();
    expect(source.requestPermission).not.toHaveBeenCalled();
    expect(source.write).not.toHaveBeenCalled();
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/notes/Welcome.md');
  });

  it('aborts a permission query made stale by a newer draft and resumes Auto-save', async () => {
    const source = await openWorkspace(false);
    const { queryPermission } = selectNextWorkspace(source);
    vi.useFakeTimers();
    const gate = pendingWrite();
    queryPermission.mockImplementationOnce(async () => {
      await gate.promise;
      return 'granted';
    });
    editText('Before query [[B]]');
    const switching = button('List Markdown Notes').click();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(queryPermission).toHaveBeenCalledTimes(1);
      editText('Newer during query [[B]]');
    } finally {
      gate.resolve();
    }
    await switching;
    expect(editor().state.doc.toString()).toBe('Newer during query [[B]]');
    expect(editor().state.facet(realLinkNavigationContext)?.adapter).toBe(
      source.adapter
    );
    expect(source.write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(750);
    expect(source.files.get('A.md')).toBe('Newer during query [[B]]');
  });

  it('disposes only the prepared workspace when Core preparation becomes stale', async () => {
    const source = await openWorkspace(false);
    selectNextWorkspace(source);
    vi.useFakeTimers();
    const gate = pendingWrite();
    const create = FoamCoreAdapter.createFromMarkdownFiles;
    let prepared: FoamCoreAdapter | undefined;
    let preparedDispose: ReturnType<typeof vi.spyOn> | undefined;
    vi.spyOn(FoamCoreAdapter, 'createFromMarkdownFiles').mockImplementationOnce(
      async notes => {
        prepared = await create(notes);
        preparedDispose = vi.spyOn(prepared.workspace, 'dispose');
        await gate.promise;
        return prepared;
      }
    );
    const sourceDispose = vi.spyOn(source.adapter.workspace, 'dispose');
    editText('Persist before preparation [[B]]');
    const switching = button('List Markdown Notes').click();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(prepared).toBeDefined();
      editText('New draft during Core preparation [[B]]');
    } finally {
      gate.resolve();
    }
    await switching;
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(preparedDispose).toHaveBeenCalledTimes(1);
    expect(editor().state.facet(realLinkNavigationContext)?.adapter).toBe(
      source.adapter
    );
    expect(editor().state.doc.toString()).toBe(
      'New draft during Core preparation [[B]]'
    );
    await vi.advanceTimersByTimeAsync(750);
    expect(source.files.get('A.md')).toBe(
      'New draft during Core preparation [[B]]'
    );
  });
});

describe('Explorer automatic save-before-navigation', () => {
  it('reuses already-granted write access instead of requesting it again', async () => {
    const { files, requestPermission } = await openWorkspace(false);
    vi.useFakeTimers();
    requestPermission.mockClear();
    editText('Granted draft [[B]]');
    await explorerFile('B.md').click();
    expect(files.get('A.md')).toBe('Granted draft [[B]]');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md');
  });

  it.each([false, true])(
    'awaits an in-flight manual Save with newer edits=%s without requesting permission again',
    async newerEdits => {
      const { files, write, adapter, requestPermission } = await openWorkspace(
        false
      );
      vi.useFakeTimers();
      const gate = pendingWrite();
      write.mockImplementationOnce(async (name, content) => {
        await gate.promise;
        files.set(name, content);
      });
      editText('Manual snapshot [[B]]');
      await button('Save Real File').click();
      await vi.advanceTimersByTimeAsync(0);
      expect(write).toHaveBeenCalledTimes(1);
      requestPermission.mockClear();
      if (newerEdits) editText('Newer manual draft [[B]]');
      const count = browser.dialogs.length;
      const leaving = explorerFile('B.md').click();
      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(requestPermission).not.toHaveBeenCalled();
        expect(write).toHaveBeenCalledTimes(1);
        expect(editor().state.facet(noteUriFacet)?.path).toBe(
          '/real-notes/A.md'
        );
      } finally {
        gate.resolve();
        await vi.advanceTimersByTimeAsync(0);
        await leaving;
      }
      const content = newerEdits
        ? 'Newer manual draft [[B]]'
        : 'Manual snapshot [[B]]';
      expect(files.get('A.md')).toBe(content);
      expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(content);
      expect(write).toHaveBeenCalledTimes(newerEdits ? 2 : 1);
      expect(requestPermission).not.toHaveBeenCalled();
      expect(browser.dialogs).toHaveLength(count);
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md');
    }
  );

  it('retains the source session when the target disappears after successful flush', async () => {
    const { files, write, adapter } = await openWorkspace(false);
    vi.useFakeTimers();
    editText('Saved before target removal [[B]]');
    const source = editor().state;
    const count = browser.dialogs.length;
    write.mockImplementationOnce(async (name, content) => {
      files.set(name, content);
      files.delete('B.md');
    });
    await explorerFile('B.md').click();
    expect(editor().state).toBe(source);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
    expect(files.get('A.md')).toBe('Saved before target removal [[B]]');
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
      'Saved before target removal [[B]]'
    );
    expect(browser.window.alert).toHaveBeenCalledWith('File not found');
    expect(browser.dialogs).toHaveLength(count);
    editText('Still editable [[B]]');
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('Still editable [[B]]');
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
      'Still editable [[B]]'
    );
    expect(write).toHaveBeenCalledTimes(2);
    expect(browser.storage.setItem).not.toHaveBeenCalled();
  });

  it('invalidates revoked access, keeps the draft and requires a gesture to retry', async () => {
    const { files, write, requestPermission, createWritable } =
      await openWorkspace(false);
    vi.useFakeTimers();
    const original = files.get('A.md');
    editText('Revoked permission draft [[B]]');
    const source = editor().state;
    createWritable.mockRejectedValueOnce(
      new DOMException('Write permission revoked', 'NotAllowedError')
    );
    requestPermission.mockClear();
    requestPermission.mockResolvedValue('denied');
    const leaving = explorerFile('B.md').click();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(editor().state).toBe(source);
    expect(files.get('A.md')).toBe(original);
    expect(write).not.toHaveBeenCalled();
    await dialogButton('Cancel').click();
    await leaving;
    await vi.advanceTimersByTimeAsync(2000);
    expect(createWritable).toHaveBeenCalledTimes(1);
    expect(requestPermission).not.toHaveBeenCalled();
    const retry = explorerFile('B.md').click();
    expect(requestPermission).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    expect(editor().state).toBe(source);
    expect(files.get('A.md')).toBe(original);
    expect(createWritable).toHaveBeenCalledTimes(1);
    requestPermission.mockResolvedValue('granted');
    await dialogButton('Save').click();
    await retry;
    expect(requestPermission).toHaveBeenCalledTimes(2);
    expect(files.get('A.md')).toBe('Revoked permission draft [[B]]');
    expect(write).toHaveBeenCalledTimes(1);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md');
  });

  it('keeps newer edits if permission is revoked during an in-flight manual Save', async () => {
    const { files, write, adapter, requestPermission, createWritable } =
      await openWorkspace(false);
    vi.useFakeTimers();
    const gate = pendingWrite();
    write.mockImplementationOnce(async (name, content) => {
      await gate.promise;
      files.set(name, content);
    });
    editText('First manual snapshot [[B]]');
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    createWritable.mockRejectedValueOnce(
      new DOMException('Write permission revoked', 'NotAllowedError')
    );
    requestPermission.mockClear();
    editText('Newer revoked draft [[B]]');
    const leaving = explorerFile('B.md').click();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(requestPermission).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledTimes(1);
    } finally {
      gate.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    await waitForDialog();
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
    expect(editor().state.doc.toString()).toBe('Newer revoked draft [[B]]');
    expect(files.get('A.md')).toBe('First manual snapshot [[B]]');
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
      'First manual snapshot [[B]]'
    );
    expect(requestPermission).not.toHaveBeenCalled();
    await dialogButton('Save').click();
    await leaving;
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(files.get('A.md')).toBe('Newer revoked draft [[B]]');
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
      'Newer revoked draft [[B]]'
    );
    expect(write).toHaveBeenCalledTimes(2);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md');
  });

  it('opens a clean note without permissions, writes or a dialog', async () => {
    const { requestPermission, write } = await openWorkspace(false);
    requestPermission.mockClear();
    const count = browser.dialogs.length;
    await explorerFile('B.md').click();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(browser.dialogs).toHaveLength(count);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md');
  });

  it.each(['\r\n', '\n'])(
    'flushes pending edits preserving %j before opening the target without a dialog',
    async separator => {
      const { files, write, adapter, requestPermission } = await openWorkspace(
        false
      );
      files.set('A.md', ['# A', '[[B]]'].join(separator));
      await explorerFile('A.md').click();
      await button('Edit Real File').click();
      requestPermission.mockClear();
      vi.useFakeTimers();
      const count = browser.dialogs.length;
      editText('# A\nLatest [[B]]');
      const leaving = explorerFile('B.md').click();
      await vi.advanceTimersByTimeAsync(0);
      const persisted = ['# A', 'Latest [[B]]'].join(separator);
      expect(files.get('A.md')).toBe(persisted);
      expect(write).toHaveBeenCalledExactlyOnceWith('A.md', persisted);
      expect(requestPermission).not.toHaveBeenCalled();
      await leaving;
      expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(persisted);
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md');
      expect(browser.dialogs).toHaveLength(count);
      expect(browser.storage.setItem).not.toHaveBeenCalled();
    }
  );

  it('initiates permission preflight in the click before any target read', async () => {
    const { requestPermission, read } = await openWorkspace(false, 'denied');
    const readTarget = vi.spyOn(
      BrowserNoteRepository.prototype,
      'readMarkdownNote'
    );
    vi.useFakeTimers();
    editText('Pending [[B]]');
    const permission = pendingWrite();
    requestPermission.mockClear();
    read.mockClear();
    requestPermission.mockImplementationOnce(async () => {
      await permission.promise;
      return 'granted';
    });
    const leaving = explorerFile('B.md').click();
    try {
      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(readTarget).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    } finally {
      permission.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    await leaving;
  });

  it.each(['Cancel', 'Save'])(
    'uses fallback on permission denial and supports %s without background permission requests',
    async decision => {
      const { files, write, requestPermission } = await openWorkspace(
        false,
        'denied'
      );
      vi.useFakeTimers();
      const original = files.get('A.md');
      editText('Permission draft [[B]]');
      requestPermission.mockResolvedValue('denied');
      const source = editor().state;
      const leaving = explorerFile('B.md').click();
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      expect(editor().state).toBe(source);
      expect(files.get('A.md')).toBe(original);
      expect(write).not.toHaveBeenCalled();
      expect(requestPermission).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(requestPermission).toHaveBeenCalledTimes(2);
      requestPermission.mockResolvedValue('granted');
      await dialogButton(decision).click();
      await leaving;
      if (decision === 'Cancel') {
        expect(editor().state).toBe(source);
        await vi.advanceTimersByTimeAsync(1000);
        expect(requestPermission).toHaveBeenCalledTimes(2);
        expect(write).not.toHaveBeenCalled();
        await button('Save Real File').click();
        await vi.advanceTimersByTimeAsync(0);
        expect(editor().state).toBe(source);
      } else
        expect(editor().state.facet(noteUriFacet)?.path).toBe(
          '/real-notes/B.md'
        );
      expect(files.get('A.md')).toBe('Permission draft [[B]]');
      expect(requestPermission).toHaveBeenCalledTimes(3);
    }
  );

  it.each(['Cancel', 'Discard'])(
    'preserves external disk changes and requires explicit %s in fallback',
    async decision => {
      const { files, write } = await openWorkspace(false);
      vi.useFakeTimers();
      editText('Conflict draft [[B]]');
      files.set('A.md', 'External A');
      const source = editor().state;
      const leaving = explorerFile('B.md').click();
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      expect(files.get('A.md')).toBe('External A');
      expect(editor().state).toBe(source);
      expect(write).not.toHaveBeenCalled();
      await dialogButton(decision).click();
      await leaving;
      expect(files.get('A.md')).toBe('External A');
      expect(write).not.toHaveBeenCalled();
      if (decision === 'Cancel') expect(editor().state).toBe(source);
      else
        expect(editor().state.facet(noteUriFacet)?.path).toBe(
          '/real-notes/B.md'
        );
    }
  );

  it.each(['Cancel', 'Save'])(
    'keeps the draft on I/O failure and allows %s',
    async decision => {
      const { files, write } = await openWorkspace(false);
      vi.useFakeTimers();
      const original = files.get('A.md');
      editText('I/O draft [[B]]');
      write.mockRejectedValueOnce(new Error('Disk write failed'));
      const source = editor().state;
      const leaving = explorerFile('B.md').click();
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      expect(write).toHaveBeenCalledTimes(1);
      expect(files.get('A.md')).toBe(original);
      expect(editor().state).toBe(source);
      await dialogButton(decision).click();
      await leaving;
      if (decision === 'Save') {
        expect(write).toHaveBeenCalledTimes(2);
        expect(files.get('A.md')).toBe('I/O draft [[B]]');
        expect(editor().state.facet(noteUriFacet)?.path).toBe(
          '/real-notes/B.md'
        );
      } else {
        await vi.advanceTimersByTimeAsync(2000);
        expect(write).toHaveBeenCalledTimes(1);
        expect(editor().state).toBe(source);
      }
    }
  );

  it('keeps Core-only failure in fallback and retries sync without rewriting disk or requesting permission', async () => {
    const { files, write, adapter, requestPermission } = await openWorkspace(
      false
    );
    vi.useFakeTimers();
    vi.spyOn(adapter, 'updateNote')
      .mockImplementationOnce(() => {
        throw new Error('Core unavailable');
      })
      .mockImplementationOnce(() => {
        throw new Error('Core still unavailable');
      });
    editText('Persisted [[B]]');
    await vi.advanceTimersByTimeAsync(750);
    const source = editor().state;
    requestPermission.mockClear();
    const leaving = explorerFile('B.md').click();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    expect(editor().state).toBe(source);
    expect(write).toHaveBeenCalledTimes(1);
    expect(requestPermission).not.toHaveBeenCalled();
    await dialogButton('Save').click();
    await leaving;
    expect(files.get('A.md')).toBe('Persisted [[B]]');
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
      'Persisted [[B]]'
    );
    expect(write).toHaveBeenCalledTimes(1);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md');
  });

  it('drains an in-flight snapshot and newer edits before navigating without double writes', async () => {
    const { files, write, adapter } = await openWorkspace(false);
    vi.useFakeTimers();
    const first = pendingWrite();
    const second = pendingWrite();
    write.mockImplementationOnce(async (name, content) => {
      await first.promise;
      files.set(name, content);
    });
    write.mockImplementationOnce(async (name, content) => {
      await second.promise;
      files.set(name, content);
    });
    editText('B [[B]]');
    await vi.advanceTimersByTimeAsync(750);
    editText('C [[B]]');
    const leaving = explorerFile('B.md').click();
    await vi.advanceTimersByTimeAsync(0);
    editText('D [[B]]');
    try {
      expect(write).toHaveBeenCalledTimes(1);
      first.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(files.get('A.md')).toBe('B [[B]]');
      expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe('B [[B]]');
      expect(write).toHaveBeenCalledTimes(2);
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
    } finally {
      first.resolve();
      second.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    await leaving;
    expect(files.get('A.md')).toBe('D [[B]]');
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe('D [[B]]');
    expect(write).toHaveBeenCalledTimes(2);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md');
  });

  it('rejects a target read made stale by newer edits after automatic persistence', async () => {
    const { files, read } = await openWorkspace(false);
    vi.useFakeTimers();
    const gate = pendingWrite();
    let targetReads = 0;
    const readFile = read.getMockImplementation()!;
    read.mockImplementation(async name => {
      if (name === 'B.md' && ++targetReads === 2) await gate.promise;
      return readFile(name);
    });
    editText('Before target read [[B]]');
    const leaving = explorerFile('B.md').click();
    await vi.advanceTimersByTimeAsync(0);
    try {
      expect(files.get('A.md')).toBe('Before target read [[B]]');
      editText('Newer draft [[B]]');
    } finally {
      gate.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    await leaving;
    expect(editor().state.doc.toString()).toBe('Newer draft [[B]]');
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('Newer draft [[B]]');
  });

  it('offers fallback for newer edits when an in-flight disk write fails', async () => {
    const { files, write } = await openWorkspace(false);
    vi.useFakeTimers();
    const gate = pendingWrite();
    write.mockImplementationOnce(async () => {
      await gate.promise;
      throw new Error('Disk write failed');
    });
    editText('B [[B]]');
    await vi.advanceTimersByTimeAsync(750);
    const leaving = explorerFile('B.md').click();
    await vi.advanceTimersByTimeAsync(0);
    editText('Newer C [[B]]');
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    expect(editor().state.doc.toString()).toBe('Newer C [[B]]');
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
    await dialogButton('Save').click();
    await leaving;
    expect(files.get('A.md')).toBe('Newer C [[B]]');
    expect(write).toHaveBeenCalledTimes(2);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md');
  });

  it('navigates from a mixed-line-ending read-only note without permissions or writes', async () => {
    const { files, write, requestPermission } = await openWorkspace(false);
    files.set('B.md', '# B\r\nMixed\nEnd');
    await explorerFile('B.md').click();
    expect(button('Edit Real File').style.display).toBe('none');
    requestPermission.mockClear();
    await explorerFile('A.md').click();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(files.get('B.md')).toBe('# B\r\nMixed\nEnd');
  });
});

describe.each(['Picker', 'Sample'])('%s safe fallback', path => {
  const navigationButton = () =>
    path === 'Sample' ? button('Return to Sample') : pickerOpenNote('B.md');

  it('navigates clean notes without a dialog or a write', async () => {
    const { write } = await openWorkspace(false);
    const dialogCount = browser.dialogs.length;
    browser.window.confirm.mockClear();
    await navigationButton().click();
    expect(browser.dialogs).toHaveLength(dialogCount);
    expect(editor().state.facet(noteUriFacet)?.path).toBe(
      path === 'Sample' ? '/notes/Welcome.md' : '/real-notes/B.md'
    );
    expect(write).not.toHaveBeenCalled();
    expect(browser.window.confirm).not.toHaveBeenCalled();
  });

  it.each(['Save', 'Discard', 'Cancel'])(
    '%s preserves disk, draft and Core as chosen',
    async decision => {
      const { files, write, adapter, context, requestPermission } =
        await openWorkspace(false, path === 'Sample' ? 'denied' : 'granted');
      vi.useFakeTimers();
      const original = files.get('A.md');
      editText('Pending [[B]]');
      const source = editor().state;
      browser.window.confirm.mockClear();
      const leaving = navigationButton().click();
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      await vi.advanceTimersByTimeAsync(1000);
      expect(editor().state).toBe(source);
      expect(write).not.toHaveBeenCalled();
      expect(context.canNavigate()).toBe(false);
      requestPermission.mockResolvedValue('granted');
      await dialogButton(decision).click();
      await leaving;
      expect(files.get('A.md')).toBe(
        decision === 'Save' ? 'Pending [[B]]' : original
      );
      expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
        files.get('A.md')
      );
      expect(browser.window.confirm).not.toHaveBeenCalled();
      expect(browser.storage.setItem).not.toHaveBeenCalled();
      if (decision === 'Cancel') {
        expect(editor().state).toBe(source);
        if (path === 'Sample') await button('Save Real File').click();
        await vi.advanceTimersByTimeAsync(750);
        expect(files.get('A.md')).toBe('Pending [[B]]');
      } else {
        expect(editor().state.facet(noteUriFacet)?.path).toBe(
          path === 'Sample' ? '/notes/Welcome.md' : '/real-notes/B.md'
        );
        await vi.advanceTimersByTimeAsync(1000);
        expect(write).toHaveBeenCalledTimes(decision === 'Save' ? 1 : 0);
      }
    }
  );

  it.each(['I/O', 'conflict', 'permission'])(
    'preserves the draft after Save %s failure and allows retry or Cancel',
    async failure => {
      const { files, write, requestPermission } = await openWorkspace(
        false,
        path === 'Sample' ? 'denied' : 'granted'
      );
      vi.useFakeTimers();
      editText('Keep draft [[B]]');
      const source = editor().state;
      if (failure === 'I/O')
        write.mockRejectedValueOnce(new Error('Disk write failed'));
      if (failure === 'conflict') files.set('A.md', 'External A');
      if (failure === 'permission')
        requestPermission.mockResolvedValue('denied');
      const leaving = navigationButton().click();
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      if (failure !== 'permission')
        requestPermission.mockResolvedValue('granted');
      await dialogButton('Save').click();
      expect(editor().state).toBe(source);
      expect(browser.dialogs.at(-1)!.isConnected).toBe(true);
      expect(dialogButton('Save').disabled).toBe(false);
      const attempts = write.mock.calls.length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(write).toHaveBeenCalledTimes(attempts);
      if (failure === 'conflict') {
        await dialogButton('Cancel').click();
        await leaving;
        expect(files.get('A.md')).toBe('External A');
        expect(editor().state).toBe(source);
      } else {
        requestPermission.mockResolvedValue('granted');
        await dialogButton('Save').click();
        await leaving;
        expect(files.get('A.md')).toBe('Keep draft [[B]]');
        expect(editor().state.facet(noteUriFacet)?.path).toBe(
          path === 'Sample' ? '/notes/Welcome.md' : '/real-notes/B.md'
        );
      }
    }
  );

  it('does not navigate or dispose while the dialog Save is writing', async () => {
    const { files, write, adapter, context, requestPermission } =
      await openWorkspace(false, path === 'Sample' ? 'denied' : 'granted');
    vi.useFakeTimers();
    editText('Slow save [[B]]');
    const source = editor().state;
    const gate = pendingWrite();
    write.mockImplementationOnce(async (name, content) => {
      await gate.promise;
      files.set(name, content);
    });
    const leaving = navigationButton().click();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    requestPermission.mockResolvedValue('granted');
    const saving = dialogButton('Save').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);
    await navigationButton().click();
    context.openNote(URI.file('/real-notes/B.md'));
    await button('List Markdown Notes').click();
    expect(editor().state).toBe(source);
    expect(dialogButton('Saving...').disabled).toBe(true);
    gate.resolve();
    await saving;
    await leaving;
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
      'Slow save [[B]]'
    );
    expect(editor().state.facet(noteUriFacet)?.path).toBe(
      path === 'Sample' ? '/notes/Welcome.md' : '/real-notes/B.md'
    );
  });

  it('does not apply an old Discard decision to a newer editor state', async () => {
    const { files, requestPermission } = await openWorkspace(
      false,
      path === 'Sample' ? 'denied' : 'granted'
    );
    vi.useFakeTimers();
    editText('Old draft [[B]]');
    const leaving = navigationButton().click();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    editText('Newer draft [[B]]');
    const newer = editor().state;
    await dialogButton('Discard').click();
    await leaving;
    expect(editor().state).toBe(newer);
    if (path === 'Sample') {
      requestPermission.mockResolvedValue('granted');
      await button('Save Real File').click();
    }
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('Newer draft [[B]]');
  });
});

describe('Note target preparation', () => {
  it('keeps newer edits when the source changes during the target read', async () => {
    const { read, files } = await openWorkspace(false);
    vi.useFakeTimers();
    const gate = pendingWrite();
    const dialogCount = browser.dialogs.length;
    read.mockImplementationOnce(async () => {
      await gate.promise;
      return '# B';
    });
    const leaving = browser.elements
      .get('#mvp-file-list')!
      .children.find(e => e.dataset.noteName === 'B.md')!
      .click();
    await vi.advanceTimersByTimeAsync(0);
    editText('New draft during Explorer read');
    const newer = editor().state;
    gate.resolve();
    await leaving;
    expect(editor().state).toBe(newer);
    expect(browser.dialogs).toHaveLength(dialogCount);
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('New draft during Explorer read');
  });

  it('retains the source if the target disappears after Discard is chosen', async () => {
    const { files, write } = await openWorkspace(false);
    vi.useFakeTimers();
    const original = files.get('A.md');
    editText('Keep this draft [[B]]');
    const source = editor().state;
    const leaving = pickerOpenNote('B.md').click();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    files.delete('B.md');
    await dialogButton('Discard').click();
    await leaving;
    expect(editor().state).toBe(source);
    expect(files.get('A.md')).toBe(original);
    expect(write).not.toHaveBeenCalled();
    expect(browser.window.alert).toHaveBeenCalledWith('File not found');
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('Keep this draft [[B]]');
  });
});

describe('real-file auto-save integration', () => {
  it.each([
    '# B\r\nFirst\nLast',
    '# B\nFirst\r\nLast',
    '# B\r\nFirst\rLast',
    '# B\rFirst\r\nLast',
    '# B\nFirst\rLast',
    '# B\rFirst\nLast',
    '# B\r\nFirst\nSecond\rLast',
  ])('M1.2b-FIX-02 keeps mixed line endings read-only: %j', async originalB => {
    const { files, write, context, adapter, requestPermission } =
      await openWorkspace(false);
    files.set('B.md', originalB);
    context.openNote(URI.file('/real-notes/B.md'));
    await vi.waitFor(() =>
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md')
    );
    expect(editor().state.readOnly).toBe(true);
    expect(editor().state.doc.toString()).toBe(
      originalB.replace(/\r\n?|\n/g, '\n')
    );
    expect(browser.elements.get('.save-status')!.textContent).toMatch(
      /mixed line endings/i
    );
    expect(button('Edit Real File').style.display).toBe('none');
    expect(button('Save Real File').style.display).toBe('none');
    const preview = editor().state;
    expect(
      preview.doc.sliceString(0, undefined, originalB.match(/\r\n?|\n/)![0])
    ).not.toBe(originalB);
    // Even an invocation of the hidden action cannot enable editing or writing.
    await button('Edit Real File').click();
    expect(editor().state).toBe(preview);
    expect(browser.window.alert).toHaveBeenCalledWith(
      expect.stringMatching(/mixed line endings/i)
    );
    await button('Save Real File').click();
    vi.useFakeTimers();
    editText('A widget must not alter this read-only preview');
    await vi.advanceTimersByTimeAsync(1000);
    expect(editor().state.doc.toString()).toBe(preview.doc.toString());
    expect(files.get('B.md')).toBe(originalB);
    expect(adapter.readNote(URI.file('/real-notes/B.md'))).toBe(originalB);
    expect(write).not.toHaveBeenCalled();
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(browser.storage.setItem).not.toHaveBeenCalled();

    // The restriction belongs to B, not the workspace or the next session.
    const next = editor().state.facet(realLinkNavigationContext)!;
    next.openNote(URI.file('/real-notes/A.md'));
    await vi.advanceTimersByTimeAsync(0);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
    expect(button('Edit Real File').style.display).toBe('inline-block');
    await button('Edit Real File').click();
    editText('Normal A\n[[B]]');
    await vi.advanceTimersByTimeAsync(750);
    expect(write).toHaveBeenCalledExactlyOnceWith('A.md', 'Normal A\n[[B]]');
    expect(files.get('B.md')).toBe(originalB);
  });

  it('M1.2b-FIX-02 preserves uniform lone CR through Auto-save, Manual Save and conflict', async () => {
    const { files, write, adapter } = await openWorkspace(false);
    files.set('B.md', '# B\rOriginal\r');
    await browser.elements
      .get('#mvp-file-list')!
      .children.find(e => e.dataset.noteName === 'B.md')!
      .click();
    await button('Edit Real File').click();
    expect(browser.elements.get('.save-status')!.textContent).toBe('Saved');
    vi.useFakeTimers();
    editText('# B\nFirst [[A]]\n');
    await vi.advanceTimersByTimeAsync(750);
    expect(write).toHaveBeenCalledExactlyOnceWith('B.md', '# B\rFirst [[A]]\r');
    editText('# B\nSecond [[A]]\n');
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(files.get('B.md')).toBe('# B\rSecond [[A]]\r');
    expect(adapter.readNote(URI.file('/real-notes/B.md'))).toBe(
      '# B\rSecond [[A]]\r'
    );
    expect(browser.elements.get('.save-status')!.textContent).toBe('Saved');
    files.set('B.md', '# B\rExternal\r');
    editText('# B\nDraft\n');
    await vi.advanceTimersByTimeAsync(750);
    expect(write).toHaveBeenCalledTimes(2);
    expect(files.get('B.md')).toBe('# B\rExternal\r');
    expect(editor().state.doc.toString()).toBe('# B\nDraft\n');
    expect(browser.window.alert).toHaveBeenCalledWith(
      expect.stringContaining('modified outside')
    );
  });

  it('M1.2b-FIX-02 preserves Undo/Redo with CRLF Auto-save snapshots', async () => {
    const { files } = await openWorkspace(false);
    files.set('B.md', '# B\r\nOriginal');
    await browser.elements
      .get('#mvp-file-list')!
      .children.find(e => e.dataset.noteName === 'B.md')!
      .click();
    await button('Edit Real File').click();
    editor().dispatch({ effects: StateEffect.appendConfig.of(history()) });
    vi.useFakeTimers();
    editText('# B\nEdited');
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('B.md')).toBe('# B\r\nEdited');
    expect(
      undo({
        state: editor().state,
        dispatch: transaction => editor().dispatch(transaction),
      })
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('B.md')).toBe('# B\r\nOriginal');
    expect(
      redo({
        state: editor().state,
        dispatch: transaction => editor().dispatch(transaction),
      })
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('B.md')).toBe('# B\r\nEdited');
  });

  it.each(['\r\n', '\n'])(
    'M1.2b-FIX-01 saves B with %j line endings after A conflict, Cancel and Discard',
    async separator => {
      const { files, write, context, adapter } = await openWorkspace(false);
      const save = vi.spyOn(
        BrowserNoteRepository.prototype,
        'saveMarkdownNote'
      );
      const originalB = ['# B', '', 'Original [[A]]', 'Last line'].join(
        separator
      );
      files.set('B.md', originalB);
      vi.useFakeTimers();
      editText('A draft [[B]]');
      files.set('A.md', 'External A');
      await vi.advanceTimersByTimeAsync(750);
      expect(write).not.toHaveBeenCalled();
      expect(browser.window.alert).toHaveBeenCalledWith(
        expect.stringContaining('modified outside')
      );

      context.openNote(URI.file('/real-notes/B.md'));
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      await dialogButton('Save').click();
      expect(browser.dialogs.at(-1)!.isConnected).toBe(true);
      expect(editor().state.doc.toString()).toBe('A draft [[B]]');
      await dialogButton('Cancel').click();
      await vi.advanceTimersByTimeAsync(0);
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');

      context.openNote(URI.file('/real-notes/B.md'));
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      await dialogButton('Discard').click();
      await vi.advanceTimersByTimeAsync(0);
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md');
      // CodeMirror stores logical lines, while the repository retains raw text.
      expect(editor().state.doc.toString()).toBe(
        originalB.replace(/\r\n/g, '\n')
      );
      expect(files.get('B.md')).toBe(originalB);
      await button('Edit Real File').click();
      expect(browser.elements.get('.save-status')!.textContent).toBe('Saved');
      browser.window.alert.mockClear();

      editor().dispatch({
        changes: { from: editor().state.doc.length, insert: '\nT2_BURST_01' },
      });
      await vi.advanceTimersByTimeAsync(750);
      const firstB = originalB + separator + 'T2_BURST_01';
      expect(save).toHaveBeenLastCalledWith('B.md', firstB, originalB);
      expect(files.get('B.md')).toBe(firstB);
      expect(write).toHaveBeenCalledExactlyOnceWith('B.md', firstB);
      expect(adapter.readNote(URI.file('/real-notes/B.md'))).toBe(firstB);
      expect(browser.elements.get('.save-status')!.textContent).toBe('Saved');

      editor().dispatch({
        changes: { from: editor().state.doc.length, insert: '\nT2_BURST_02' },
      });
      await vi.advanceTimersByTimeAsync(750);
      const secondB = firstB + separator + 'T2_BURST_02';
      expect(save).toHaveBeenLastCalledWith('B.md', secondB, firstB);
      expect(files.get('B.md')).toBe(secondB);
      expect(write).toHaveBeenCalledTimes(2);
      expect(adapter.readNote(URI.file('/real-notes/B.md'))).toBe(secondB);
      expect(browser.window.alert).not.toHaveBeenCalled();
      expect(files.get('A.md')).toBe('External A');
      expect(browser.storage.setItem).not.toHaveBeenCalled();

      // Even a line-ending-only external change must trip the strict guard.
      const externalB = secondB.replace(
        /\r\n|\n/g,
        separator === '\r\n' ? '\n' : '\r\n'
      );
      files.set('B.md', externalB);
      editor().dispatch({
        changes: { from: editor().state.doc.length, insert: '\nKeep draft' },
      });
      await vi.advanceTimersByTimeAsync(750);
      expect(files.get('B.md')).toBe(externalB);
      expect(write).toHaveBeenCalledTimes(2);
      expect(adapter.readNote(URI.file('/real-notes/B.md'))).toBe(secondB);
      expect(editor().state.doc.toString()).toContain('Keep draft');
      expect(browser.window.alert).toHaveBeenCalledWith(
        expect.stringContaining('modified outside')
      );
    }
  );

  it('M1.2b-FIX-01 keeps CRLF snapshots and baseline ordered during an in-flight save', async () => {
    const { files, write, adapter } = await openWorkspace(false);
    files.set('B.md', '# B\r\nOriginal');
    await browser.elements
      .get('#mvp-file-list')!
      .children.find(e => e.dataset.noteName === 'B.md')!
      .click();
    await button('Edit Real File').click();
    vi.useFakeTimers();
    const gate = pendingWrite();
    write.mockImplementationOnce(async (name, content) => {
      await gate.promise;
      files.set(name, content);
    });
    editText('# B\nFirst [[A]]');
    await vi.advanceTimersByTimeAsync(750);
    expect(write).toHaveBeenCalledExactlyOnceWith('B.md', '# B\r\nFirst [[A]]');
    editText('# B\nSecond [[A]]');
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(files.get('B.md')).toBe('# B\r\nFirst [[A]]');
    expect(adapter.readNote(URI.file('/real-notes/B.md'))).toBe(
      '# B\r\nFirst [[A]]'
    );
    expect(browser.elements.get('.save-status')!.textContent).toBe(
      'Unsaved changes'
    );
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(2);
    expect(files.get('B.md')).toBe('# B\r\nSecond [[A]]');
    expect(adapter.readNote(URI.file('/real-notes/B.md'))).toBe(
      '# B\r\nSecond [[A]]'
    );
    expect(browser.elements.get('.save-status')!.textContent).toBe('Saved');
  });

  it.each([{ contents: ['B'] }, { contents: ['B', 'C', 'D'] }])(
    'debounces editor changes $contents and keeps them out of localStorage',
    async ({ contents }) => {
      const { files, write, requestPermission } = await openWorkspace(false);
      vi.useFakeTimers();
      for (const content of contents) {
        editText(content);
        await vi.advanceTimersByTimeAsync(100);
      }
      await vi.advanceTimersByTimeAsync(649);
      expect(write).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(write).toHaveBeenCalledExactlyOnceWith('A.md', contents.at(-1));
      expect(files.get('A.md')).toBe(contents.at(-1));
      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(browser.elements.get('.save-status')!.textContent).toContain(
        'Saved'
      );
      expect(browser.storage.setItem).not.toHaveBeenCalled();
    }
  );

  it('saves B then C against B, publishing only the content on disk', async () => {
    const { files, write, adapter } = await openWorkspace(false);
    vi.useFakeTimers();
    const gate = pendingWrite();
    write.mockImplementationOnce(async (name, content) => {
      await gate.promise;
      files.set(name, content);
    });
    const graph = FoamGraph.fromWorkspace(adapter.workspace, true);
    editText('B [[B]]');
    await vi.advanceTimersByTimeAsync(750);
    expect(write).toHaveBeenCalledTimes(1);
    expect(browser.elements.get('.save-status')!.textContent).toContain(
      'Saving'
    );
    expect(browser.elements.get('.panel-title')!.textContent).toBe('A.md');
    editText('C [[B]] [[NewDraft]]');
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(files.get('A.md')).toBe('B [[B]]');
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe('B [[B]]');
    expect(graph.getLinks(URI.file('/real-notes/A.md'))).toHaveLength(1);
    expect(editor().state.doc.toString()).toBe('C [[B]] [[NewDraft]]');
    expect(browser.elements.get('.save-status')!.textContent).toContain(
      'Unsaved'
    );
    expect(browser.elements.get('.panel-title')!.textContent).toBe('A.md');
    await vi.advanceTimersByTimeAsync(750);
    expect(write).toHaveBeenCalledTimes(2);
    expect(files.get('A.md')).toBe('C [[B]] [[NewDraft]]');
    expect(graph.getLinks(URI.file('/real-notes/A.md'))).toHaveLength(2);
    graph.dispose();
  });

  it('manual Save shares an in-flight auto-save instead of writing twice', async () => {
    const { files, write, requestPermission } = await openWorkspace(false);
    vi.useFakeTimers();
    const gate = pendingWrite();
    write.mockImplementationOnce(async (name, content) => {
      await gate.promise;
      files.set(name, content);
    });
    editText('B');
    await vi.advanceTimersByTimeAsync(750);
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledExactlyOnceWith('A.md', 'B');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(browser.elements.get('.save-status')!.textContent).toContain(
      'Saved'
    );
  });

  it('preserves the draft after permission denial and retries only from explicit Save', async () => {
    const { files, write, requestPermission } = await openWorkspace(
      false,
      'denied'
    );
    vi.useFakeTimers();
    const original = files.get('A.md');
    editText('Recoverable draft');
    await vi.advanceTimersByTimeAsync(750);
    expect(write).not.toHaveBeenCalled();
    expect(files.get('A.md')).toBe(original);
    expect(editor().state.doc.toString()).toBe('Recoverable draft');
    expect(browser.elements.get('.save-status')!.textContent).toMatch(
      /permission/i
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    requestPermission.mockResolvedValue('granted');
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledExactlyOnceWith('A.md', 'Recoverable draft');
    expect(requestPermission).toHaveBeenCalledTimes(2);
    expect(browser.elements.get('.save-status')!.textContent).toContain(
      'Saved'
    );
  });

  it('does not overwrite an external modification or retry a conflict endlessly', async () => {
    const { files, write, adapter } = await openWorkspace(false);
    vi.useFakeTimers();
    const original = files.get('A.md');
    editText('My draft');
    files.set('A.md', 'External text');
    await vi.advanceTimersByTimeAsync(750);
    expect(write).not.toHaveBeenCalled();
    expect(files.get('A.md')).toBe('External text');
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(original);
    expect(browser.elements.get('.save-status')!.textContent).toContain(
      'Save failed'
    );
    expect(browser.elements.get('.panel-title')!.textContent).toBe('A.md');
    expect(browser.elements.get('.save-status')!.dataset.tone).toBe('error');
    editText('Newer draft');
    await vi.advanceTimersByTimeAsync(5000);
    expect(write).not.toHaveBeenCalled();
    expect(editor().state.doc.toString()).toBe('Newer draft');
    expect(browser.window.alert).toHaveBeenCalledWith(
      expect.stringContaining('modified outside')
    );
  });

  it('shows disk-saved/Core-sync-failed and retries publication without rewriting', async () => {
    const { files, write, adapter, requestPermission } = await openWorkspace(
      false
    );
    vi.useFakeTimers();
    const sync = vi
      .spyOn(adapter, 'updateNote')
      .mockImplementationOnce(() => {
        throw new Error('Core unavailable');
      })
      .mockImplementationOnce(() => {
        throw new Error('Core still unavailable during automatic navigation');
      });
    editText('Persisted [[B]]');
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('Persisted [[B]]');
    expect(browser.elements.get('.save-status')!.textContent).toMatch(
      /Disk saved.*Core sync failed/
    );
    const source = editor().state;
    const leaving = button('Return to Sample').click();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    await dialogButton('Cancel').click();
    await leaving;
    expect(editor().state).toBe(source);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sync).toHaveBeenCalledTimes(2);
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
      'Persisted [[B]]'
    );
    expect(browser.elements.get('.save-status')!.textContent).toContain(
      'Saved'
    );
  });

  it.each(['Picker'])(
    'blocks %s departure during an in-flight save',
    async path => {
      const { files, write } = await openWorkspace(false);
      vi.useFakeTimers();
      const gate = pendingWrite();
      write.mockImplementationOnce(async (name, content) => {
        await gate.promise;
        files.set(name, content);
      });
      editText('B [[B]]');
      await vi.advanceTimersByTimeAsync(750);
      const source = editor().state;
      if (path === 'Picker') await pickerOpenNote('B.md').click();
      await vi.advanceTimersByTimeAsync(0);
      expect(editor().state).toBe(source);
      expect(browser.window.alert).toHaveBeenCalledWith(
        expect.stringMatching(/wait/i)
      );
      gate.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(files.get('A.md')).toBe('B [[B]]');
      expect(write).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['Wikilink', 'Picker', 'Workspace', 'Sample'])(
    '%s departure cancels a pending timer only after explicit discard',
    async path => {
      const { files, write, context } = await openWorkspace(
        false,
        path === 'Wikilink' || path === 'Sample' ? 'denied' : 'granted'
      );
      vi.useFakeTimers();
      const original = files.get('A.md');
      editText('Discarded [[B]]');
      let leaving: Promise<void> | undefined;
      if (path === 'Wikilink') context.openNote(URI.file('/real-notes/B.md'));
      else if (path === 'Workspace')
        leaving = button('List Markdown Notes').click();
      else if (path === 'Picker') leaving = pickerOpenNote('B.md').click();
      else leaving = button('Return to Sample').click();
      await vi.advanceTimersByTimeAsync(0);
      await waitForDialog();
      await vi.advanceTimersByTimeAsync(1000);
      expect(write).not.toHaveBeenCalled();
      await dialogButton('Discard').click();
      await leaving;
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(editor().state.doc.toString()).not.toBe('Discarded [[B]]');
      expect(files.get('A.md')).toBe(original);
      expect(write).not.toHaveBeenCalled();
      expect(browser.storage.setItem).not.toHaveBeenCalled();
    }
  );

  it('Cancel keeps the source and Auto-save resumes after an explicit permission retry', async () => {
    const { files, write, context, requestPermission } = await openWorkspace(
      false,
      'denied'
    );
    vi.useFakeTimers();
    editText('Keep [[B]]');
    context.openNote(URI.file('/real-notes/B.md'));
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).not.toHaveBeenCalled();
    await dialogButton('Cancel').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
    requestPermission.mockResolvedValue('granted');
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('Keep [[B]]');
  });

  it('preserves newer edits made while preparing a replacement workspace', async () => {
    const { read, write } = await openWorkspace(false);
    vi.useFakeTimers();
    const gate = pendingWrite();
    read.mockImplementationOnce(async () => {
      await gate.promise;
      return '[[B]]';
    });
    const switching = button('List Markdown Notes').click();
    await vi.advanceTimersByTimeAsync(0);
    editText('New draft during folder read');
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await switching;
    expect(editor().state.doc.toString()).toBe('New draft during folder read');
    expect(write).not.toHaveBeenCalled();
    expect(browser.window.alert).toHaveBeenCalledWith(
      expect.stringContaining('Workspace switching was cancelled')
    );
    await vi.advanceTimersByTimeAsync(750);
    expect(write).toHaveBeenCalledExactlyOnceWith(
      'A.md',
      'New draft during folder read'
    );
  });

  it('keeps sample editing in localStorage after leaving a real session', async () => {
    const { write } = await openWorkspace(false, 'denied');
    vi.useFakeTimers();
    editText('Discard me');
    const leaving = button('Return to Sample').click();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    await dialogButton('Discard').click();
    await leaving;
    const sample = editor().state.doc.toString() + '\nSample edit';
    editText(sample);
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).not.toHaveBeenCalled();
    expect(browser.storage.setItem).toHaveBeenCalledWith(
      'foam-editor-poc-note:file:///notes/Welcome.md',
      sample
    );
  });

  it('cannot run the discarded note timer against a newly edited note', async () => {
    const { files, write, adapter } = await openWorkspace(false);
    vi.useFakeTimers();
    const original = files.get('A.md');
    editText('Old session draft');
    const leaving = pickerOpenNote('B.md').click();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    await dialogButton('Discard').click();
    await leaving;
    await button('Edit Real File').click();
    editText('New session [[A]]');
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).toHaveBeenCalledExactlyOnceWith('B.md', 'New session [[A]]');
    expect(files.get('A.md')).toBe(original);
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(original);
    expect(adapter.readNote(URI.file('/real-notes/B.md'))).toBe(
      'New session [[A]]'
    );
    expect(browser.elements.get('.panel-title')!.textContent).toBe('B.md');
    expect(browser.elements.get('.save-status')!.textContent).toBe('Saved');
  });

  it('aborts a stale Wikilink read and resumes saving the newer source draft', async () => {
    const { read, files, context } = await openWorkspace(false);
    vi.useFakeTimers();
    const gate = pendingWrite();
    read.mockImplementationOnce(async () => {
      await gate.promise;
      return '# B';
    });
    editText('First [[B]]');
    context.openNote(URI.file('/real-notes/B.md'));
    await vi.advanceTimersByTimeAsync(0);
    editText('Newer [[B]]');
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('Newer [[B]]');
  });

  it('cancels workspace replacement if the editor changes after the discard decision', async () => {
    const { read, write } = await openWorkspace(false);
    vi.useFakeTimers();
    editText('Before discard');
    const switching = button('List Markdown Notes').click();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    const gate = pendingWrite();
    read.mockImplementationOnce(async () => {
      await gate.promise;
      return '[[B]]';
    });
    await dialogButton('Discard').click();
    await vi.advanceTimersByTimeAsync(0);
    editText('New edits after discard');
    gate.resolve();
    await switching;
    expect(editor().state.doc.toString()).toBe('New edits after discard');
    expect(browser.window.alert).toHaveBeenCalledWith(
      expect.stringContaining('Workspace switching was cancelled')
    );
    expect(write).not.toHaveBeenCalled();
  });

  it('does not activate a stale workspace snapshot if a manual save finishes during reload', async () => {
    const { read, files } = await openWorkspace(false);
    vi.useFakeTimers();
    editText('Saved while reloading');
    const source = editor().state;
    const switching = button('List Markdown Notes').click();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    const gate = pendingWrite();
    const oldContent = files.get('A.md')!;
    read.mockImplementationOnce(async () => {
      await gate.promise;
      return oldContent;
    });
    await dialogButton('Discard').click();
    await vi.advanceTimersByTimeAsync(0);
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(files.get('A.md')).toBe('Saved while reloading');
    gate.resolve();
    await switching;
    expect(editor().state).toBe(source);
    expect(browser.window.alert).toHaveBeenCalledWith(
      expect.stringContaining('Workspace switching was cancelled')
    );
  });
});
