export async function saveJsonFile(contents, fileName) {
  const text = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2);

  if (window.__POSTDIM_VSCODE__ && window.postdimBridge?.invoke) {
    const result = await window.postdimBridge.invoke('write_json_file', { contents: text, fileName });
    return !result?.canceled;
  }

  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}

export async function openJsonFile() {
  if (!window.__POSTDIM_VSCODE__ || !window.postdimBridge?.invoke) return null;
  const result = await window.postdimBridge.invoke('read_json_file');
  if (!result || result.canceled) return null;
  return new File([result.contents], result.fileName || 'import.json', { type: 'application/json' });
}
