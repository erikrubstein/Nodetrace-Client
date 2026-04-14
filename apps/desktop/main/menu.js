export function buildApplicationMenu({ Menu, isMac, appVersion, sendMenuCommand, launchDetachedMainProcess }) {
  const appSubmenu = isMac
    ? [
        { role: 'about', label: 'About Nodetrace' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Nodetrace' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Nodetrace' },
      ]
    : []

  return Menu.buildFromTemplate([
    ...(isMac ? [{ label: 'Nodetrace', submenu: appSubmenu }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Create Project', accelerator: 'CmdOrCtrl+N', click: () => sendMenuCommand('file.create-project') },
        { label: 'Open Project', accelerator: 'CmdOrCtrl+O', click: () => sendMenuCommand('file.open-project') },
        { label: 'Open New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => launchDetachedMainProcess() },
        {
          label: 'Import',
          submenu: [{ label: 'Project', click: () => sendMenuCommand('file.import-project') }],
        },
        {
          label: 'Export',
          submenu: [
            { label: 'Project', click: () => sendMenuCommand('file.export-project') },
            { label: 'Media Tree', click: () => sendMenuCommand('file.export-media-tree') },
          ],
        },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: 'Exit' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Add Node', click: () => sendMenuCommand('edit.add-node') },
        { label: 'Add Photo Node', click: () => sendMenuCommand('edit.add-photo-node') },
        { label: 'Add Photo', click: () => sendMenuCommand('edit.add-photo') },
        { label: 'Delete Node', click: () => sendMenuCommand('edit.delete-node') },
      ],
    },
    {
      label: 'Select',
      submenu: [
        { label: 'Select Results', click: () => sendMenuCommand('select.results') },
        { label: 'Select Parents', click: () => sendMenuCommand('select.parents') },
        { label: 'Select Children', click: () => sendMenuCommand('select.children') },
        { label: 'Append Select Results', click: () => sendMenuCommand('select.append-results') },
        { label: 'Append Select Parents', click: () => sendMenuCommand('select.append-parents') },
        { label: 'Append Select Children', click: () => sendMenuCommand('select.append-children') },
        { label: 'Invert Selection', click: () => sendMenuCommand('select.invert') },
      ],
    },
    {
      label: 'Tree',
      submenu: [
        { label: 'Collapse All', click: () => sendMenuCommand('tree.collapse-all') },
        { label: 'Collapse Selected', click: () => sendMenuCommand('tree.collapse-selected') },
        { label: 'Collapse Recursively', click: () => sendMenuCommand('tree.collapse-recursively') },
        { label: 'Expand All', click: () => sendMenuCommand('tree.expand-all') },
        { label: 'Expand Selected', click: () => sendMenuCommand('tree.expand-selected') },
        { label: 'Expand Recursively', click: () => sendMenuCommand('tree.expand-recursively') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Results Only', click: () => sendMenuCommand('view.toggle-results-only') },
        { label: 'Toggle Ancestors Only', click: () => sendMenuCommand('view.toggle-ancestors-only') },
        { label: 'Toggle Focus Path', click: () => sendMenuCommand('view.toggle-focus-path') },
        { label: 'Fit View', click: () => sendMenuCommand('view.fit-view') },
        { label: 'Focus Selected', click: () => sendMenuCommand('view.focus-selected') },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Settings',
      submenu: [
        { label: 'Manage Server Profiles', click: () => sendMenuCommand('settings.manage-server-profiles') },
        { label: 'Generate Session Code', click: () => sendMenuCommand('settings.generate-session-code') },
        { label: 'Reset Cache', click: () => sendMenuCommand('settings.reset-cache') },
        {
          label: 'Apply Theme',
          submenu: [
            { label: 'Dark', click: () => sendMenuCommand('settings.theme-dark') },
            { label: 'Light', click: () => sendMenuCommand('settings.theme-light') },
          ],
        },
      ],
    },
    ...(isMac
      ? [
          {
            label: 'Window',
            submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
          },
        ]
      : []),
    {
      label: 'Help',
      submenu: [
        { label: 'Check For Updates', click: () => sendMenuCommand('help.check-for-updates') },
        { label: `Version ${appVersion}`, enabled: false },
      ],
    },
  ])
}
